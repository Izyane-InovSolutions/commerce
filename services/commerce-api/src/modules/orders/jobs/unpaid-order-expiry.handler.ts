import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { JobHandler } from '../../../infrastructure/jobs/job-handler.interface';
import { checkoutExpiredConflict } from '../../checkout/checkout-attempt.errors';
import { OrdersService } from '../orders.service';
import {
  UNPAID_ORDER_EXPIRY_JOB_TYPE,
  type UnpaidOrderExpiryPayload,
} from './unpaid-order-expiry.job';

/** Thrown (so the job retries later) while a checkout request still owns the order. */
export class UnpaidOrderStillOwnedError extends Error {
  constructor(orderId: string, attemptId: string) {
    super(
      `Checkout attempt ${attemptId} still holds a live lease on order ${orderId}; retrying later`,
    );
  }
}

/**
 * Cancels a checkout order that never got a Payment row once its
 * reservations have lapsed. A keyed checkout that fails transiently before
 * payment keeps its order so a retry with the same key can resume it; if no
 * retry ever comes, this is what gives the stock back and records the key's
 * final answer (CHECKOUT_EXPIRED). Enqueued in the order transaction, so it
 * exists for every checkout order, keyed or not.
 *
 * Lock order (users → checkout_attempts → carts → orders → …): the linked
 * attempt row is locked before the orders row, exactly as the Payment insert
 * takes them (its attempt guard, then OrdersService.lockForPayment). The two
 * are therefore serialized without a deadlock: an insert that got there
 * first leaves a Payment row, which makes this a no-op; one that comes after
 * finds the order cancelled (or the attempt no longer owned) and creates
 * nothing.
 */
@Injectable()
export class UnpaidOrderExpiryHandler implements JobHandler {
  readonly type = UNPAID_ORDER_EXPIRY_JOB_TYPE;

  private readonly logger = new Logger(UnpaidOrderExpiryHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async handle(payload: Prisma.JsonValue): Promise<void> {
    const { orderId } = this.parsePayload(payload);

    const cancelled = await this.prisma.$transaction(async (tx) => {
      // The link is written in the order's own transaction and never
      // changes, so this unlocked read already sees the final attempt.
      const linked = await tx.checkoutAttempt.findUnique({
        where: { orderId },
        select: { id: true },
      });
      if (linked)
        await tx.$queryRaw`SELECT id FROM checkout_attempts WHERE id = ${linked.id}::uuid FOR UPDATE`;
      await this.ordersService.lockForPayment(orderId, tx);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, payment: { select: { id: true } } },
      });
      // Gone with its user, already settled or cancelled, or a payment may
      // have been submitted: the payment's own outcome decides, not us.
      if (!order || order.status !== OrderStatus.PENDING_PAYMENT) return false;
      if (order.payment) return false;

      const attempt = linked
        ? await tx.checkoutAttempt.findUniqueOrThrow({
            where: { id: linked.id },
            select: { id: true, status: true, leaseExpiresAt: true },
          })
        : null;
      const now = new Date();
      if (
        attempt?.status === 'IN_PROGRESS' &&
        attempt.leaseExpiresAt &&
        attempt.leaseExpiresAt > now
      )
        throw new UnpaidOrderStillOwnedError(orderId, attempt.id);

      await this.ordersService.cancel(orderId, tx);

      if (attempt?.status === 'IN_PROGRESS') {
        const expired = checkoutExpiredConflict(orderId);
        await tx.checkoutAttempt.updateMany({
          where: {
            id: attempt.id,
            status: 'IN_PROGRESS',
            OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
          },
          data: {
            status: 'REJECTED',
            stage: 'FINISHED',
            response: expired.getResponse() as Prisma.InputJsonValue,
            errorStatus: expired.getStatus(),
            completedAt: now,
            ownerToken: null,
            leaseExpiresAt: null,
          },
        });
      }
      return true;
    });

    if (cancelled)
      this.logger.log(
        `Cancelled order ${orderId}: no payment started before its reservations lapsed`,
      );
  }

  private parsePayload(payload: Prisma.JsonValue): UnpaidOrderExpiryPayload {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      typeof (payload as { orderId?: unknown }).orderId !== 'string'
    )
      throw new Error(
        `Malformed ${UNPAID_ORDER_EXPIRY_JOB_TYPE} payload: expected { orderId: string }`,
      );
    return { orderId: (payload as { orderId: string }).orderId };
  }
}
