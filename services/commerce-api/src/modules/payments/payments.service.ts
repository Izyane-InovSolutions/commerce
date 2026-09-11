import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  RefundStatus,
  type Payment,
  type Prisma,
  type Refund,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from '../financials/ledger.service';
import { OrderWithItems, OrdersService } from '../orders/orders.service';
import type { PaymentDetailsDto } from './dto/payment-details.dto';
import { PaymentOutcomeUnknownException } from './gateway-errors';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderPaymentResult,
  type ProviderRefundResult,
} from './payment-provider';

const PROVIDER_STATUS_TO_PAYMENT_STATUS: Record<
  ProviderPaymentResult['status'],
  PaymentStatus
> = {
  PENDING: PaymentStatus.PENDING,
  REQUIRES_ACTION: PaymentStatus.REQUIRES_ACTION,
  PROCESSING: PaymentStatus.PROCESSING,
  SUCCEEDED: PaymentStatus.SUCCEEDED,
  FAILED: PaymentStatus.FAILED,
  CANCELLED: PaymentStatus.CANCELLED,
};

export type PaymentWithRedirect = Payment & {
  redirectUrl?: string;
  gatewayStatus?: string;
  requiresReconciliation?: boolean;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ordersService: OrdersService,
    private readonly ledgerService: LedgerService,
  ) {}

  async initializeForOrder(
    order: OrderWithItems,
    details?: PaymentDetailsDto,
  ): Promise<PaymentWithRedirect> {
    this.provider.validateInput?.({
      paymentId: order.id,
      reference: order.id,
      amount: order.total,
      currency: order.currency,
      idempotencyKey: order.id,
      details,
    });
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: this.provider.name,
        status: PaymentStatus.PENDING,
        amount: order.total,
        currency: order.currency,
        idempotencyKey: order.id,
      },
    });

    let accepted = false;
    try {
      const result = await this.provider.initialize({
        paymentId: payment.id,
        amount: order.total,
        currency: order.currency,
        idempotencyKey: order.id,
        reference: order.id,
        details,
      });
      accepted = true;

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerReference: result.providerReference,
          status: PROVIDER_STATUS_TO_PAYMENT_STATUS[result.status],
        },
      });

      return {
        ...updated,
        redirectUrl: result.redirectUrl,
        ...(result.gatewayStatus
          ? {
              gatewayStatus: result.gatewayStatus,
              requiresReconciliation: result.gatewayStatus !== 'PENDING',
            }
          : {}),
      };
    } catch (error) {
      if (accepted || error instanceof PaymentOutcomeUnknownException) {
        // Never release stock or create a new payment after an ambiguous charge.
        // Return the existing durable payment ID for subsequent reconciliation.
        try {
          const pending = await this.prisma.payment.update({
            where: { id: payment.id },
            data: { failureReason: 'Gateway outcome requires reconciliation' },
          });
          return { ...pending, requiresReconciliation: true };
        } catch {
          return { ...payment, requiresReconciliation: true };
        }
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureReason:
            error instanceof Error
              ? error.message
              : 'Unknown payment provider error',
        },
      });
      throw error;
    }
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.provider.verifyWebhook(rawBody, signature);
    const initial = await this.prisma.payment.findUnique({
      where: { providerReference: event.providerReference },
    });
    if (!initial || initial.provider !== this.provider.name)
      throw new NotFoundException(
        'Payment not found for this provider reference',
      );
    await this.prisma.$transaction(async (tx) => {
      await this.ordersService.lockForPayment(initial.orderId, tx);
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: initial.id },
      });
      const existing = await tx.paymentEvent.findUnique({
        where: { providerEventId: event.id },
      });
      if (existing) {
        if (existing.paymentId !== payment.id)
          throw new ConflictException(
            'Provider event belongs to another payment',
          );
        return;
      }
      const status = PROVIDER_STATUS_TO_PAYMENT_STATUS[event.status];
      const settled = [
        PaymentStatus.SUCCEEDED,
        PaymentStatus.PARTIALLY_REFUNDED,
        PaymentStatus.REFUNDED,
      ].includes(payment.status as never);
      const rejected = [PaymentStatus.FAILED, PaymentStatus.CANCELLED].includes(
        payment.status as never,
      );
      if (!settled && !rejected) {
        if (status === PaymentStatus.SUCCEEDED)
          await this.ordersService.confirmPayment(payment.orderId, tx);
        else if (
          status === PaymentStatus.FAILED ||
          status === PaymentStatus.CANCELLED
        )
          await this.ordersService.cancel(payment.orderId, tx);
        await tx.payment.update({
          where: { id: payment.id },
          data: { status },
        });
      } else if (rejected && status === PaymentStatus.SUCCEEDED) {
        throw new ConflictException(
          'Payment succeeded after local cancellation; reconciliation is required',
        );
      }
      // The dedupe record commits with every business effect. A failed
      // transaction leaves the event retryable.
      await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          providerEventId: event.id,
          type: event.type,
          status,
          payload: event.payload as Prisma.InputJsonValue,
        },
      });
    });
  }

  async refundSellerOrder(
    sellerOrderId: string,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<Refund> {
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new ConflictException('Refund amount must be positive minor units');
    const initial =
      await this.ordersService.getSellerOrderForPayment(sellerOrderId);
    const prepared = await this.prisma.$transaction(async (tx) => {
      await this.ordersService.lockForPayment(initial.orderId, tx);
      const existing = await tx.refund.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        if (
          existing.sellerOrderId !== sellerOrderId ||
          existing.amount !== amount ||
          existing.reason !== reason
        )
          throw new ConflictException(
            'Idempotency key already belongs to a different refund request',
          );
        return { refund: existing, reference: null };
      }
      const sellerOrder = await this.ordersService.getSellerOrderForPayment(
        sellerOrderId,
        tx,
      );
      const payment = await tx.payment.findUnique({
        where: { orderId: sellerOrder.orderId },
      });
      if (!payment)
        throw new NotFoundException('Payment not found for this order');
      if (payment.provider !== this.provider.name || !payment.providerReference)
        throw new ConflictException(
          'Payment provider or reference is unavailable',
        );
      if (
        !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status) ||
        !['PAID', 'PARTIALLY_REFUNDED'].includes(sellerOrder.status) ||
        payment.currency !== sellerOrder.currency
      )
        throw new ConflictException(
          'Only a confirmed payment and paid seller order can be refunded',
        );
      const pending = await tx.refund.findMany({
        where: {
          paymentId: payment.id,
          status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSING] },
        },
      });
      const paymentHeld = pending.reduce((sum, row) => sum + row.amount, 0);
      const sellerHeld = pending
        .filter((row) => row.sellerOrderId === sellerOrderId)
        .reduce((sum, row) => sum + row.amount, 0);
      if (
        amount > payment.amount - payment.refundedAmount - paymentHeld ||
        amount > sellerOrder.total - sellerOrder.refundedAmount - sellerHeld
      )
        throw new ConflictException(
          'Refund amount exceeds the remaining refundable balance, including pending refunds',
        );
      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          sellerOrderId,
          amount,
          currency: sellerOrder.currency,
          reason,
          status: RefundStatus.PENDING,
          idempotencyKey,
        },
      });
      return { refund, reference: payment.providerReference };
    });
    if (!prepared.reference) return prepared.refund;
    let result: ProviderRefundResult;
    try {
      result = await this.provider.refund(
        prepared.reference,
        amount,
        reason,
        idempotencyKey,
      );
    } catch (error) {
      // Only explicit rejection releases reserved refund capacity. Timeouts
      // and unclassified errors may have happened after the provider accepted.
      const rejected =
        error instanceof HttpException &&
        [400, 404, 422, 501].includes(error.getStatus());
      await this.prisma.refund.update({
        where: { id: prepared.refund.id },
        data: {
          status: rejected ? RefundStatus.FAILED : RefundStatus.PENDING,
          failureReason: rejected
            ? 'Provider rejected this refund operation'
            : 'Refund outcome requires reconciliation',
        },
      });
      throw error;
    }
    await this.prisma.refund.update({
      where: { id: prepared.refund.id },
      data: { providerReference: result.providerReference },
    });
    return this.finishRefund(prepared.refund.id, result);
  }

  async reconcileRefund(refundId: string): Promise<Refund> {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund) throw new NotFoundException('Refund not found');
    if (!['PENDING', 'PROCESSING'].includes(refund.status)) return refund;
    if (
      refund.payment.provider !== this.provider.name ||
      !refund.providerReference
    )
      throw new ConflictException(
        'Refund requires provider reconciliation using its idempotency key',
      );
    return this.finishRefund(
      refund.id,
      await this.provider.getRefund(refund.providerReference),
    );
  }

  private async finishRefund(
    refundId: string,
    result: ProviderRefundResult,
  ): Promise<Refund> {
    const initial = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { payment: true },
    });
    if (
      !['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(
        result.status,
      ) ||
      !result.providerReference
    )
      throw new PaymentOutcomeUnknownException();
    return this.prisma.$transaction(async (tx) => {
      await this.ordersService.lockForPayment(initial.payment.orderId, tx);
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
      });
      if (!['PENDING', 'PROCESSING'].includes(refund.status)) return refund;
      if (
        refund.providerReference &&
        refund.providerReference !== result.providerReference
      )
        throw new ConflictException(
          'Provider returned a different refund reference',
        );
      if (result.status === 'SUCCEEDED') {
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: refund.paymentId },
        });
        const sellerOrder = await this.ordersService.getSellerOrderForPayment(
          refund.sellerOrderId,
          tx,
        );
        const refundedAmount = payment.refundedAmount + refund.amount;
        if (refundedAmount > payment.amount)
          throw new ConflictException(
            'Payment refund total requires reconciliation',
          );
        await this.ordersService.applyRefund(
          refund.sellerOrderId,
          refund.amount,
          tx,
        );
        await this.ledgerService.recordRefundReversal(
          sellerOrder,
          refund.amount,
          refund.id,
          tx,
        );
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount,
            status:
              refundedAmount === payment.amount
                ? PaymentStatus.REFUNDED
                : PaymentStatus.PARTIALLY_REFUNDED,
          },
        });
      }
      return tx.refund.update({
        where: { id: refund.id },
        data: {
          status: result.status,
          providerReference: result.providerReference,
          failureReason: null,
        },
      });
    });
  }
}
