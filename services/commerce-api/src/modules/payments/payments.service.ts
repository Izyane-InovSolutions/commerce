import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, type Payment, type Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OrderWithItems, OrdersService } from '../orders/orders.service';
import {
  PAYMENT_PROVIDER,
  type InitializePaymentInput,
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

export type PaymentWithRedirect = Payment & { redirectUrl?: string };

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ordersService: OrdersService,
  ) {}

  async initializeForOrder(
    order: OrderWithItems,
    paymentInput: Omit<InitializePaymentInput, 'paymentId' | 'amount' | 'currency' | 'idempotencyKey' | 'reference'>,
  ): Promise<PaymentWithRedirect> {
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

    try {
      const result = await this.provider.initialize({
        ...paymentInput,
        paymentId: payment.id,
        amount: order.total,
        currency: order.currency,
        idempotencyKey: order.id,
        reference: order.id,
      });

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerReference: result.providerReference,
          status: PROVIDER_STATUS_TO_PAYMENT_STATUS[result.status],
        },
      });

      return { ...updated, redirectUrl: result.redirectUrl };
    } catch (error) {
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
}
