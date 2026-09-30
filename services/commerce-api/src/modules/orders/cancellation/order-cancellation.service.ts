import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, type Payment } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../../infrastructure/jobs/outbox.service';
import { AuditService } from '../../audit/audit.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../payments/payment-provider';
import { PaymentsService } from '../../payments/payments.service';
import {
  toProviderStatus,
  type GatewayPayment,
} from '../../payments/unified-payment.provider';
import { OrdersService, OrderWithItems } from '../orders.service';

export const ORDER_CANCELLED_TOPIC = 'order.cancelled';

/** Payment states that can still turn into a charge. */
const OPEN_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.REQUIRES_ACTION,
  PaymentStatus.PROCESSING,
];

/** A provider that can ask its gateway to stop a payment (the unified
 * gateway can; the pending placeholder and test doubles can't). */
type CancellablePaymentProvider = PaymentProvider & {
  cancelPayment(
    providerReference: string,
    reason: string,
  ): Promise<GatewayPayment>;
};

function canCancelAtGateway(
  provider: PaymentProvider,
): provider is CancellablePaymentProvider {
  return (
    typeof (provider as Partial<CancellablePaymentProvider>).cancelPayment ===
    'function'
  );
}

export type OrderCancellationActor = {
  userId: string;
  kind: 'customer' | 'staff';
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class OrderCancellationService {
  private readonly logger = new Logger(OrderCancellationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  /** A customer cancelling their own order; anyone else's is a 404. */
  async cancelOwn(
    actor: OrderCancellationActor,
    orderId: string,
  ): Promise<OrderWithItems> {
    await this.ordersService.findOwn(actor.userId, orderId);
    await this.cancel(orderId, actor);
    return this.ordersService.findOwn(actor.userId, orderId);
  }

  /** Staff cancelling any customer's unpaid order. */
  async cancelAny(
    actor: OrderCancellationActor,
    orderId: string,
  ): Promise<OrderWithItems> {
    await this.ordersService.findAny(orderId);
    await this.cancel(orderId, actor);
    return this.ordersService.findAny(orderId);
  }

  /**
   * Cancels an order that has not been paid for.
   *
   * Only PENDING_PAYMENT qualifies: once money is taken the order goes
   * through fulfillment cancellations or a return instead, which refund
   * through the ledger. Already CANCELLED is a no-op, so a retried request
   * is safe.
   *
   * The open payment attempt is stopped at the gateway first — before any
   * local change — so a charge the shopper already approved is discovered
   * (and applied) rather than cancelled over. Then, in one transaction, the
   * stock reservations are released and the order cancelled
   * (OrdersService.cancel, the same path a failed payment takes), with the
   * audit row and the `order.cancelled` outbox event. Finally the payment
   * row is marked CANCELLED through PaymentsService's own event path, so it
   * gets the same dedupe record a gateway-reported cancellation would.
   */
  private async cancel(
    orderId: string,
    actor: OrderCancellationActor,
  ): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    if (order.status === OrderStatus.CANCELLED) return;
    this.requireUnpaid(order.status);

    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });
    const reason =
      actor.kind === 'customer'
        ? 'Order cancelled by the customer'
        : 'Order cancelled by staff';

    const openPayment =
      payment && OPEN_PAYMENT_STATUSES.includes(payment.status)
        ? payment
        : null;
    if (payment?.status === PaymentStatus.SUCCEEDED) {
      // Settled at the gateway but not yet applied here — apply it rather
      // than cancel a paid order.
      await this.paymentsService.reconcile(payment.id);
      throw this.alreadyPaid();
    }
    if (openPayment) await this.stopAtGateway(openPayment, reason);

    const transitioned = await this.prisma.$transaction(async (tx) => {
      await this.ordersService.lockForPayment(orderId, tx);
      const current = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, userId: true },
      });
      if (current.status === OrderStatus.CANCELLED) return false;
      this.requireUnpaid(current.status);

      await this.ordersService.cancel(orderId, tx);
      await this.auditService.record(
        {
          actorUserId: actor.userId,
          action:
            actor.kind === 'customer'
              ? 'order.cancelled_by_customer'
              : 'order.cancelled_by_staff',
          targetType: 'Order',
          targetId: orderId,
          metadata: {
            paymentId: payment?.id ?? null,
            paymentStatus: payment?.status ?? null,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        tx,
      );
      await this.outboxService.record(
        {
          topic: ORDER_CANCELLED_TOPIC,
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: { orderId, userId: current.userId },
        },
        tx,
      );
      return true;
    });

    if (transitioned && openPayment) {
      await this.markPaymentCancelled(openPayment, reason);
    }
  }

  /**
   * Asks the gateway to stop the payment. A gateway that answers "already
   * paid" wins: the payment is reconciled (confirming the order) and the
   * cancel refused. A payment with no gateway reference yet — its
   * initialisation outcome is unknown — can't be safely stopped, so it
   * must be reconciled first.
   */
  private async stopAtGateway(payment: Payment, reason: string): Promise<void> {
    if (payment.provider !== this.provider.name || !payment.providerReference)
      throw new ConflictException(
        "This order's payment is still being confirmed with the payment provider; try again once it has been reconciled",
      );

    if (!canCancelAtGateway(this.provider)) return;

    const gateway = await this.provider.cancelPayment(
      payment.providerReference,
      reason,
    );
    if (toProviderStatus(gateway.status) === 'SUCCEEDED') {
      await this.paymentsService.reconcile(payment.id);
      throw this.alreadyPaid();
    }
  }

  /** Best-effort: the order is already cancelled and its stock released; a
   * failure here leaves only the payment row PENDING, which reconciliation
   * resolves (and flags, should the gateway ever report it paid). */
  private async markPaymentCancelled(
    payment: Payment,
    reason: string,
  ): Promise<void> {
    try {
      await this.paymentsService.applyProviderResult(payment, {
        providerReference: payment.providerReference!,
        status: 'CANCELLED',
        gatewayStatus: 'ORDER_CANCELLED',
        failureMessage: reason,
      });
    } catch (error) {
      this.logger.warn(
        `Order ${payment.orderId} was cancelled but its payment ${payment.id} could not be marked cancelled: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private requireUnpaid(status: OrderStatus): void {
    if (status !== OrderStatus.PENDING_PAYMENT)
      throw new ConflictException(
        'Only an order that is still awaiting payment can be cancelled. A paid order is cancelled through fulfillment cancellation or a return instead.',
      );
  }

  private alreadyPaid(): ConflictException {
    return new ConflictException(
      'This order has already been paid, so it can no longer be cancelled. A paid order is cancelled through fulfillment cancellation or a return instead.',
    );
  }
}
