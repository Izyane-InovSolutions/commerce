import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Payment } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../database/prisma.service';
import { PaymentsService } from './payments.service';
import {
  toProviderStatus,
  UnifiedPaymentProvider,
} from './unified-payment.provider';
import type {
  GatewayPayment,
  GatewayPaymentPage,
} from './unified-payment.provider';
import {
  GatewayPaymentQueryDto,
  RefundPaymentDto,
} from './dto/gateway-payment.dto';

export type PaymentSnapshot = {
  id: string;
  orderId: string;
  localStatus: Payment['status'];
  gateway: GatewayPayment;
  requiresReconciliation: boolean;
};

@Injectable()
export class GatewayPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: UnifiedPaymentProvider,
    private readonly payments: PaymentsService,
    private readonly users: UsersService,
  ) {}

  async get(userId: string, id: string): Promise<PaymentSnapshot> {
    const payment = await this.own(userId, id);
    return this.snapshot(
      payment,
      await this.gateway.getDetails(this.reference(payment)),
    );
  }

  /**
   * Asks the gateway where a payment stands, and acts on the answer.
   *
   * Reading without applying is what left a paid order sitting at
   * PENDING_PAYMENT: the gateway had settled it and nothing here noticed. A
   * status the platform does not recognise still changes nothing.
   */
  async status(userId: string, id: string): Promise<PaymentSnapshot> {
    return this.refreshStatus(await this.own(userId, id));
  }

  /**
   * The status route's gateway check and settlement, minus the ownership
   * check — shared with PaymentReconciliationHandler so a payment nobody
   * polls is settled by exactly the same path as one the customer does.
   */
  async refreshStatus(payment: Payment): Promise<PaymentSnapshot> {
    const gateway = await this.gateway.checkStatus(this.reference(payment));
    // Verify the recorded settlement before applying any business effects.
    await this.snapshot(payment, gateway);
    const reconciled = await this.payments.applyProviderResult(payment, {
      providerReference: gateway.paymentId,
      status: toProviderStatus(gateway.status),
      gatewayStatus: gateway.status,
      amount: Math.round(gateway.amount * 100),
      currency: gateway.currency,
      reference: gateway.reference,
      failureCode: gateway.failureCode,
      failureMessage: gateway.failureMessage,
    });

    return this.snapshot(reconciled, gateway);
  }

  async cancel(
    userId: string,
    id: string,
    reason: string,
  ): Promise<PaymentSnapshot> {
    const payment = await this.own(userId, id);
    if (!['PENDING', 'PROCESSING', 'REQUIRES_ACTION'].includes(payment.status))
      throw new ConflictException('Only pending payments can be cancelled');
    await this.audit(userId, id, 'payment.cancel_requested');
    return this.snapshot(
      payment,
      await this.gateway.cancelPayment(this.reference(payment), reason),
    );
  }

  /**
   * Gives up on a payment the gateway never settled, for
   * PaymentReconciliationHandler once the attempt has expired or outlived
   * PAYMENT_RECONCILIATION_MAX_AGE_SECONDS.
   *
   * The gateway is asked to cancel first, so the charge can't still go
   * through after the order is cancelled here. If its answer shows the
   * payment settled in the meantime, that outcome is applied instead. A
   * gateway that can't cancel (unsupported, or no longer knows the payment)
   * doesn't block the local expiry; any other failure is left to the job's
   * retry, since the charge's state is then unknown.
   */
  async expire(payment: Payment, reason: string): Promise<Payment> {
    const reference = this.reference(payment);
    try {
      const gateway = await this.gateway.cancelPayment(reference, reason);
      if (toProviderStatus(gateway.status) === 'SUCCEEDED') {
        await this.snapshot(payment, gateway);
        return this.payments.applyProviderResult(payment, {
          providerReference: gateway.paymentId,
          status: 'SUCCEEDED',
          gatewayStatus: gateway.status,
          amount: Math.round(gateway.amount * 100),
          currency: gateway.currency,
          reference: gateway.reference,
        });
      }
    } catch (error) {
      if (
        !(error instanceof NotImplementedException) &&
        !(error instanceof NotFoundException)
      )
        throw error;
    }
    return this.payments.expire(payment, reason);
  }

  async list(
    adminId: string,
    query: GatewayPaymentQueryDto,
  ): Promise<GatewayPaymentPage> {
    await this.actor(adminId, true);
    return this.gateway.listPayments(query);
  }

  async refund(
    adminId: string,
    id: string,
    dto: RefundPaymentDto,
    idempotencyKey: string,
  ): Promise<PaymentSnapshot> {
    await this.actor(adminId, true);
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'SUCCEEDED' || dto.amount > payment.amount)
      throw new ConflictException(
        'Refund requires a confirmed payment and an amount within its total',
      );
    await this.audit(adminId, id, 'payment.refund_requested');
    void idempotencyKey;
    throw new NotImplementedException(
      'Use the seller-order refund endpoint to keep payment, order and ledger records consistent',
    );
  }

  private async own(userId: string, id: string): Promise<Payment> {
    await this.actor(userId);
    const payment = await this.prisma.payment.findFirst({
      where: { id, order: { userId } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  private reference(payment: Payment): string {
    if (payment.provider !== this.gateway.name)
      throw new ConflictException('Payment belongs to a different provider');
    if (!payment.providerReference)
      throw new ConflictException(
        'Gateway payment ID is unavailable; reconcile using the order reference before retrying',
      );
    return payment.providerReference;
  }

  private async snapshot(
    payment: Payment,
    gateway: GatewayPayment,
  ): Promise<PaymentSnapshot> {
    const settlement = await this.prisma.paymentSettlement.findUnique({
      where: { paymentId: payment.id },
    });
    if (
      gateway.paymentId !== payment.providerReference ||
      gateway.reference !== payment.orderId ||
      gateway.currency !== (settlement?.currency ?? payment.currency) ||
      Math.round(gateway.amount * 100) !==
        (settlement?.amount ?? payment.amount)
    )
      throw new ConflictException(
        'Gateway payment does not match the local order',
      );
    // Flags the cases a person has to look at: a gateway status this
    // platform has no mapping for, or a settlement that did not take locally.
    const mapped = toProviderStatus(gateway.status);
    return {
      id: payment.id,
      orderId: payment.orderId,
      localStatus: payment.status,
      // Customer-facing payment snapshots always show the original ZMW amount.
      gateway: {
        ...gateway,
        amount: payment.amount / 100,
        currency: payment.currency,
      },
      requiresReconciliation:
        (mapped === 'PENDING' && gateway.status !== 'PENDING') ||
        (mapped === 'SUCCEEDED' && payment.status !== 'SUCCEEDED'),
    };
  }

  private async actor(id: string, admin = false): Promise<void> {
    const user = await this.users.findAccessById(id);
    if (!user?.isActive || (admin && user.role !== Role.ADMIN))
      throw new ForbiddenException('Insufficient payment permissions');
  }

  private async audit(
    actorUserId: string,
    targetId: string,
    action: string,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: { actorUserId, targetType: 'Payment', targetId, action },
    });
  }
}
