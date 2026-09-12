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
    const payment = await this.own(userId, id);
    const gateway = await this.gateway.checkStatus(this.reference(payment));
    const reconciled = await this.payments.applyProviderResult(payment, {
      providerReference: gateway.paymentId,
      status: toProviderStatus(gateway.status),
      gatewayStatus: gateway.status,
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

  private snapshot(payment: Payment, gateway: GatewayPayment): PaymentSnapshot {
    if (
      gateway.paymentId !== payment.providerReference ||
      gateway.reference !== payment.orderId ||
      gateway.currency !== payment.currency ||
      Math.round(gateway.amount * 100) !== payment.amount
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
      gateway,
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
