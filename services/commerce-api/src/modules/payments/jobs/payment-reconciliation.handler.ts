import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import type { JobHandler } from '../../../infrastructure/jobs/job-handler.interface';
import type { GatewayPayment } from '../unified-payment.provider';
import { GatewayPaymentsService } from '../gateway-payments.service';
import { PENDING_STATUSES } from '../payments.service';

export const PAYMENT_RECONCILIATION_JOB_TYPE = 'payments.reconcile';

function parsePaymentId(payload: Prisma.JsonValue): string {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof (payload as { paymentId?: unknown }).paymentId !== 'string'
  )
    throw new Error(
      `Malformed ${PAYMENT_RECONCILIATION_JOB_TYPE} payload: expected { paymentId: string }`,
    );
  return (payload as { paymentId: string }).paymentId;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Settles one payment nobody is polling, queued by
 * PaymentReconciliationScheduler.
 *
 * The gateway is asked exactly as the customer's `POST payments/:id/status`
 * would (GatewayPaymentsService.refreshStatus). A payment still unresolved
 * after that is given up on once its gateway attempt or settlement quote has
 * expired, or it has outlived PAYMENT_RECONCILIATION_MAX_AGE_SECONDS —
 * cancelling the order and releasing its stock (GatewayPaymentsService.expire).
 *
 * A payment with no gateway reference is left alone: its initialisation
 * outcome is unknown, and PaymentsService.initializeForOrder's rule is that
 * such a charge is never released automatically.
 */
@Injectable()
export class PaymentReconciliationHandler implements JobHandler {
  readonly type = PAYMENT_RECONCILIATION_JOB_TYPE;
  private readonly logger = new Logger(PaymentReconciliationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gatewayPayments: GatewayPaymentsService,
  ) {}

  async handle(payload: Prisma.JsonValue): Promise<void> {
    if (this.config.get('PAYMENTS_PROVIDER', 'pending') !== 'unified') return;

    const payment = await this.prisma.payment.findUnique({
      where: { id: parsePaymentId(payload) },
      include: { settlement: true },
    });
    if (
      !payment ||
      payment.provider !== 'unified' ||
      !payment.providerReference ||
      !PENDING_STATUSES.includes(payment.status as never)
    )
      return;

    const { settlement, ...row } = payment;
    const snapshot = await this.gatewayPayments.refreshStatus(row);
    if (!PENDING_STATUSES.includes(snapshot.localStatus as never)) return;

    const reason = this.expiryReason(
      row.createdAt,
      settlement?.expiresAt ?? null,
      snapshot.gateway,
    );
    if (!reason) return;

    this.logger.log(`Expiring payment ${row.id}: ${reason}`);
    await this.gatewayPayments.expire(row, reason);
  }

  private expiryReason(
    createdAt: Date,
    settlementExpiresAt: Date | null,
    gateway: GatewayPayment,
  ): string | null {
    const now = new Date();
    const attemptExpiresAt = parseDate(gateway.expiresAt);
    if (attemptExpiresAt && attemptExpiresAt <= now)
      return 'The payment attempt expired before it was completed';
    if (settlementExpiresAt && settlementExpiresAt <= now)
      return 'The payment was not completed before its exchange-rate quote expired';
    const maxAgeSeconds = Number(
      this.config.get('PAYMENT_RECONCILIATION_MAX_AGE_SECONDS', 3_600),
    );
    if (now.getTime() - createdAt.getTime() >= maxAgeSeconds * 1_000)
      return `The payment was not completed within ${Math.round(maxAgeSeconds / 60)} minutes`;
    return null;
  }
}
