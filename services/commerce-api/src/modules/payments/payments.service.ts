import {
  ConflictException,
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

    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: event.providerReference },
    });

    if (!payment) {
      throw new NotFoundException(
        'Payment not found for this provider reference',
      );
    }

    const existingEvent = await this.prisma.paymentEvent.findUnique({
      where: { providerEventId: event.id },
    });

    if (existingEvent) {
      // Already processed this delivery - gateways retry webhooks.
      return;
    }

    const status = PROVIDER_STATUS_TO_PAYMENT_STATUS[event.status];

    await this.prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        providerEventId: event.id,
        type: event.type,
        status,
        payload: event.payload as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status },
    });

    if (status === PaymentStatus.SUCCEEDED) {
      await this.ordersService.confirmPayment(payment.orderId);
    } else if (
      status === PaymentStatus.FAILED ||
      status === PaymentStatus.CANCELLED
    ) {
      await this.ordersService.cancel(payment.orderId);
    }
  }

  // Fully domain-integrated refund: updates Payment/Refund, applies the
  // SellerOrder status transition and restock via OrdersService, and
  // reverses the seller's ledger entry - unlike GatewayPaymentsService's
  // raw admin refund action, which only touches the gateway.
  async refundSellerOrder(
    sellerOrderId: string,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<Refund> {
    const sellerOrder =
      await this.ordersService.getSellerOrderForPayment(sellerOrderId);

    const payment = await this.prisma.payment.findUnique({
      where: { orderId: sellerOrder.orderId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found for this order');
    }

    if (!payment.providerReference) {
      throw new ConflictException(
        'Payment has no gateway reference to refund against',
      );
    }

    const remaining = sellerOrder.total - sellerOrder.refundedAmount;

    if (amount > remaining) {
      throw new ConflictException(
        'Refund amount exceeds the remaining refundable balance for this seller order',
      );
    }

    const refund = await this.prisma.refund.create({
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

    let result: { providerReference: string; status: string };
    try {
      result = await this.provider.refund(
        payment.providerReference,
        amount,
        reason,
        idempotencyKey,
      );
    } catch (error) {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.FAILED,
          failureReason:
            error instanceof Error
              ? error.message
              : 'Unknown payment provider error',
        },
      });
      throw error;
    }

    const updatedRefund = await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: RefundStatus.SUCCEEDED,
        providerReference: result.providerReference,
      },
    });

    const refundedAmount = payment.refundedAmount + amount;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount,
        status:
          refundedAmount >= payment.amount
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED,
      },
    });

    await this.ordersService.applyRefund(sellerOrderId, amount);
    await this.ledgerService.recordRefundReversal(sellerOrder, amount);

    return updatedRefund;
  }
}
