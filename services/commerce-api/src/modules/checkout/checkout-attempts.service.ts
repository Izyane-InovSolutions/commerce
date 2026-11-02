import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReservationStatus,
  type CheckoutAttempt,
  type Payment,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import type { OrderWithItems } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import {
  CHECKOUT_ATTEMPT_LEASE_MS,
  CHECKOUT_IN_PROGRESS,
  CHECKOUT_KEY_LEGACY_RECEIPT,
  CHECKOUT_KEY_REUSED,
  CHECKOUT_PAYMENT_FAILED,
  CHECKOUT_REQUIRES_RECONCILIATION,
  CheckoutAttemptSupersededError,
  checkoutAttemptConflict,
  checkoutExpiredConflict,
  isDefiniteCheckoutFailure,
} from './checkout-attempt.errors';
import {
  CheckoutFingerprintService,
  type NormalizedCheckoutRequest,
} from './checkout-fingerprint';
import type {
  CheckoutAttemptContext,
  CheckoutIdempotencyKey,
  CheckoutResult,
} from './checkout.types';

const AttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
} as const;

const AttemptStage = {
  RECEIVED: 'RECEIVED',
  PAYMENT_STARTED: 'PAYMENT_STARTED',
  FINISHED: 'FINISHED',
} as const;

/**
 * How much reservation lifetime a resumed order must still have. Resuming
 * starts the payment, and the customer may then spend minutes approving it
 * at the gateway; a reservation that lapses meanwhile frees the stock for
 * someone else, and the charge would then land on an order that can no
 * longer be confirmed. An order closer to expiry than this is given up
 * (CHECKOUT_EXPIRED) instead — no payment exists yet, so that is safe.
 */
export const CHECKOUT_RESUME_MIN_RESERVATION_MS = 5 * 60_000;

/** A payment that will never accept a charge; nothing was taken from the customer. */
const TERMINAL_FAILURE_STATUSES: PaymentStatus[] = [
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
];

type AttemptEntry =
  | { replay: CheckoutResult }
  | { context: CheckoutAttemptContext };

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * The status and body a replay must reproduce. HTTP errors keep their own
 * response; anything else is recorded as the global AllExceptionsFilter would
 * have rendered it, so the retry sees the same answer the original caller did.
 */
function recordedRejection(error: unknown): {
  status: number;
  response: Prisma.InputJsonValue;
} {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status >= 400 && status <= 599)
      return { status, response: toJson(error.getResponse()) };
  }
  const candidate =
    typeof error === 'object' && error !== null
      ? ((error as { status?: unknown; statusCode?: unknown }).status ??
        (error as { statusCode?: unknown }).statusCode)
      : undefined;
  const status =
    typeof candidate === 'number' && candidate >= 400 && candidate < 600
      ? candidate
      : 500;
  const message =
    status < 500 && error instanceof Error
      ? error.message
      : 'An unexpected error occurred';
  return { status, response: { statusCode: status, message } };
}

/**
 * The receipt behind an optional `Idempotency-Key` on checkout.
 *
 * A keyed request first claims its (userId, key) attempt with a lease and an
 * owner token, then runs. Every later request with that key gets the
 * recorded outcome (COMPLETED replays the stored response, REJECTED the
 * stored error), a 409 while it is still running, or — once the lease has
 * lapsed — takes the attempt over and resumes it. Resumption is only ever
 * local work: a Payment row is committed before the provider is called, so
 * once one exists for the linked order the attempt is BLOCKED for
 * reconciliation instead of risking a second submission — unless that
 * payment was definitively refused, which makes the key REJECTED.
 *
 * Owner writes are fenced on the owner token (the order link inside the
 * order transaction, and the Payment insert inside its own transaction), so
 * a request that outlived its lease can neither link a second order nor
 * start a payment; it gets CHECKOUT_IN_PROGRESS.
 */
@Injectable()
export class CheckoutAttemptsService {
  private readonly logger = new Logger(CheckoutAttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fingerprints: CheckoutFingerprintService,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Runs `execute` under the key's attempt, or returns/throws the outcome
   * already recorded for it. Without a key this is just `execute(null)`: no
   * receipt, no retry protection.
   */
  async run(
    userId: string,
    idempotencyKey: CheckoutIdempotencyKey | undefined,
    request: NormalizedCheckoutRequest,
    execute: (
      context: CheckoutAttemptContext | null,
    ) => Promise<CheckoutResult>,
  ): Promise<CheckoutResult> {
    if (!idempotencyKey) return execute(null);

    const entry = await this.enter(userId, idempotencyKey, request);
    if ('replay' in entry) return entry.replay;

    try {
      return await execute(entry.context);
    } catch (error) {
      // Superseded: another request owns the key now and decides its outcome.
      if (error instanceof CheckoutAttemptSupersededError) throw error;
      try {
        await this.recordFailure(entry.context, error);
      } catch (classificationError) {
        // The lease still lapses, so the next retry re-evaluates from scratch.
        this.logger.error(
          `Could not record the outcome of checkout attempt ${entry.context.attemptId}`,
          classificationError instanceof Error
            ? classificationError.stack
            : String(classificationError),
        );
      }
      throw error;
    }
  }

  /**
   * Renews the lease as payment starts. Runs inside the transaction that
   * creates the Payment row (see PaymentsService.initializeForOrder), so the
   * row is only ever inserted by the attempt's current owner; throws
   * (creating no payment) if this request lost the attempt.
   */
  async markPaymentStarted(
    context: CheckoutAttemptContext,
    orderId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const { count } = await tx.checkoutAttempt.updateMany({
      where: {
        id: context.attemptId,
        ownerToken: context.ownerToken,
        status: AttemptStatus.IN_PROGRESS,
        orderId,
      },
      data: {
        stage: AttemptStage.PAYMENT_STARTED,
        leaseExpiresAt: this.leaseFromNow(),
      },
    });
    if (count !== 1) throw new CheckoutAttemptSupersededError();
  }

  /**
   * Records the response a retry replays. Keyed on the order rather than the
   * owner: a payment exists, so whichever request finished it is the truth,
   * even over a BLOCKED written by a retry that misjudged the lease.
   */
  async complete(
    context: CheckoutAttemptContext,
    orderId: string,
    result: CheckoutResult,
  ): Promise<void> {
    const { count } = await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: context.attemptId,
        orderId,
        status: { in: [AttemptStatus.IN_PROGRESS, AttemptStatus.BLOCKED] },
      },
      data: {
        status: AttemptStatus.COMPLETED,
        stage: AttemptStage.FINISHED,
        response: this.storedResponse(result),
        completedAt: new Date(),
        ownerToken: null,
        leaseExpiresAt: null,
      },
    });
    if (count !== 1)
      this.logger.warn(
        `Checkout attempt ${context.attemptId} was already finished; order ${orderId} response not recorded`,
      );
  }

  private async enter(
    userId: string,
    { key }: CheckoutIdempotencyKey,
    request: NormalizedCheckoutRequest,
  ): Promise<AttemptEntry> {
    let attempt = await this.prisma.checkoutAttempt.findUnique({
      where: { userId_key: { userId, key } },
    });

    if (!attempt) {
      // Orders checked out with this key before attempt receipts existed
      // cannot be told apart from a different request: refuse, never redo.
      const legacy = await this.findLegacyReceipt(userId, key);
      if (legacy)
        throw checkoutAttemptConflict(
          CHECKOUT_KEY_LEGACY_RECEIPT,
          'This Idempotency-Key was used by an earlier checkout that cannot be retried; check your orders before checking out with a new key',
          { orderId: legacy.orderId },
        );

      const fingerprint = this.fingerprints.compute(request);
      const ownerToken = randomUUID();
      try {
        attempt = await this.prisma.checkoutAttempt.create({
          data: {
            userId,
            key,
            operation: request.operation,
            fingerprint: fingerprint.fingerprint,
            fingerprintKeyId: fingerprint.keyId,
            fingerprintVersion: fingerprint.version,
            status: AttemptStatus.IN_PROGRESS,
            stage: AttemptStage.RECEIVED,
            ownerToken,
            leaseExpiresAt: this.leaseFromNow(),
          },
        });
        return { context: { attemptId: attempt.id, ownerToken } };
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        // A concurrent request with the same key won the insert.
        attempt = await this.prisma.checkoutAttempt.findUniqueOrThrow({
          where: { userId_key: { userId, key } },
        });
      }
    }

    return this.resolveExisting(attempt, request);
  }

  /**
   * A receipt for this key that predates lowercased keys: before Stage 7 the
   * header was stored verbatim, both on orders and on draft attempts, so the
   * same key may sit there in another letter case. `key` is lowercased.
   */
  private async findLegacyReceipt(
    userId: string,
    key: string,
  ): Promise<{ orderId: string | null } | null> {
    const [draft] = await this.prisma.$queryRaw<{ order_id: string | null }[]>`
      SELECT order_id FROM checkout_attempts
      WHERE user_id = ${userId}::uuid AND lower(key) = ${key} AND key <> ${key}
      LIMIT 1`;
    if (draft) return { orderId: draft.order_id };
    const [order] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM orders
      WHERE user_id = ${userId}::uuid AND lower(idempotency_key) = ${key}
      LIMIT 1`;
    return order ? { orderId: order.id } : null;
  }

  private async resolveExisting(
    attempt: CheckoutAttempt,
    request: NormalizedCheckoutRequest,
  ): Promise<AttemptEntry> {
    const comparison = this.fingerprints.verify(attempt, request);
    if (attempt.operation !== request.operation || comparison === 'mismatch')
      throw checkoutAttemptConflict(
        CHECKOUT_KEY_REUSED,
        'This Idempotency-Key was already used for a different checkout request',
      );
    if (comparison === 'incomparable')
      throw checkoutAttemptConflict(
        CHECKOUT_KEY_LEGACY_RECEIPT,
        'This Idempotency-Key belongs to a checkout that can no longer be compared with a retry; check your orders before checking out with a new key',
        { orderId: attempt.orderId },
      );

    switch (attempt.status) {
      case AttemptStatus.COMPLETED:
        return { replay: attempt.response as unknown as CheckoutResult };
      case AttemptStatus.REJECTED:
        throw new HttpException(
          (attempt.response ?? 'Checkout failed') as
            | string
            | Record<string, unknown>,
          attempt.errorStatus ?? 500,
        );
      case AttemptStatus.BLOCKED: {
        const payment = attempt.orderId
          ? await this.paymentsService.findForOrder(attempt.orderId)
          : null;
        if (!attempt.orderId || !payment)
          throw await this.reconciliationConflict(attempt.orderId);
        return this.answerForPayment(
          attempt.id,
          attempt.orderId,
          payment,
          request,
        );
      }
      case AttemptStatus.IN_PROGRESS:
        return this.takeOver(attempt, request);
      default:
        throw new Error(
          `Checkout attempt ${attempt.id} has unknown status ${attempt.status}`,
        );
    }
  }

  /** An IN_PROGRESS attempt: wait for a live owner, otherwise claim it and resume. */
  private async takeOver(
    attempt: CheckoutAttempt,
    request: NormalizedCheckoutRequest,
  ): Promise<AttemptEntry> {
    const now = new Date();
    if (attempt.leaseExpiresAt && attempt.leaseExpiresAt > now)
      throw await this.inProgressConflict(attempt.orderId);

    if (attempt.orderId) {
      const payment = await this.paymentsService.findForOrder(attempt.orderId);
      if (payment)
        return this.answerForPayment(
          attempt.id,
          attempt.orderId,
          payment,
          request,
        );
    }

    // Compare-and-set on the owner we read and on the lease still being
    // lapsed: an owner that renewed in the meantime keeps its attempt.
    const ownerToken = randomUUID();
    const { count } = await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: attempt.id,
        status: AttemptStatus.IN_PROGRESS,
        ownerToken: attempt.ownerToken,
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: { ownerToken, leaseExpiresAt: this.leaseFromNow() },
    });
    if (count !== 1) throw await this.inProgressConflict(attempt.orderId);

    const context: CheckoutAttemptContext = {
      attemptId: attempt.id,
      ownerToken,
    };
    // The previous owner may have linked its order after our first read.
    const { orderId } = await this.prisma.checkoutAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
      select: { orderId: true },
    });
    if (!orderId) return { context };

    try {
      return await this.resume(context, orderId, request);
    } catch (error) {
      // Fenced on IN_PROGRESS: a no-op once resume recorded BLOCKED/REJECTED.
      await this.release(context).catch((releaseError: unknown) =>
        this.logger.warn(
          `Could not release checkout attempt ${attempt.id}: ${
            releaseError instanceof Error
              ? releaseError.message
              : String(releaseError)
          }`,
        ),
      );
      throw error;
    }
  }

  /**
   * Continues an order an interrupted owner created. Only safe while no
   * Payment row exists (the provider was certainly never called) and the
   * order still holds every reservation it was priced against, each with at
   * least CHECKOUT_RESUME_MIN_RESERVATION_MS left to run.
   */
  private async resume(
    context: CheckoutAttemptContext,
    orderId: string,
    request: NormalizedCheckoutRequest,
  ): Promise<AttemptEntry> {
    const payment = await this.paymentsService.findForOrder(orderId);
    if (payment)
      return this.answerForPayment(
        context.attemptId,
        orderId,
        payment,
        request,
      );

    const order = await this.ordersService.findForCheckout(orderId);
    if (await this.holdsAllReservations(order))
      return { context: { ...context, resumeOrderId: orderId } };

    // No payment exists, so giving up is a definite outcome for this key.
    // The cancel takes the order lock the Payment insert takes, and the
    // previous owner's insert is fenced on the token we replaced, so no
    // payment can appear for this order from here on.
    if (order.status === OrderStatus.PENDING_PAYMENT)
      await this.ordersService.cancel(orderId);
    const expired = checkoutExpiredConflict(orderId);
    await this.reject(context, expired);
    throw expired;
  }

  private async holdsAllReservations(order: OrderWithItems): Promise<boolean> {
    if (
      order.status !== OrderStatus.PENDING_PAYMENT ||
      order.items.length === 0
    )
      return false;
    const reservationIds = order.items.map((item) => item.reservationId);
    if (reservationIds.some((id) => !id)) return false;
    const reservations = await this.prisma.reservation.findMany({
      where: { id: { in: reservationIds as string[] } },
      select: { status: true, expiresAt: true },
    });
    const mustLastUntil = Date.now() + CHECKOUT_RESUME_MIN_RESERVATION_MS;
    return (
      reservations.length === new Set(reservationIds).size &&
      reservations.every(
        (reservation) =>
          reservation.status === ReservationStatus.ACTIVE &&
          reservation.expiresAt.getTime() > mustLastUntil,
      )
    );
  }

  /**
   * The answer for an unfinished (IN_PROGRESS with a lapsed lease, or
   * BLOCKED) attempt whose order has a Payment row. A payment that was
   * definitively refused never charged anything, so once its order is
   * cancelled the key is REJECTED for good — otherwise a crash between the
   * refusal and recording it would leave the key needing a reconciliation
   * that can never happen. Any other payment may have been submitted and
   * BLOCKS the key. Throws unless the attempt was meanwhile completed.
   */
  private async answerForPayment(
    attemptId: string,
    orderId: string,
    payment: Payment,
    request: NormalizedCheckoutRequest,
  ): Promise<AttemptEntry> {
    if (TERMINAL_FAILURE_STATUSES.includes(payment.status)) {
      let order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      // A refused payment can never charge: release the stock its order
      // still holds, exactly as the request that saw the refusal would have.
      if (order?.status === OrderStatus.PENDING_PAYMENT)
        order = await this.ordersService.cancel(orderId);
      if (order?.status === OrderStatus.CANCELLED)
        return this.rejectRefusedPayment(
          attemptId,
          orderId,
          payment.id,
          request,
        );
    }
    await this.block(attemptId);
    throw await this.reconciliationConflict(orderId, payment.id);
  }

  private async rejectRefusedPayment(
    attemptId: string,
    orderId: string,
    paymentId: string,
    request: NormalizedCheckoutRequest,
  ): Promise<AttemptEntry> {
    const rejection = checkoutAttemptConflict(
      CHECKOUT_PAYMENT_FAILED,
      'Payment was not accepted; start a new checkout with a new key',
      { orderId, paymentId },
    );
    const { count } = await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: attemptId,
        status: { in: [AttemptStatus.IN_PROGRESS, AttemptStatus.BLOCKED] },
      },
      data: {
        status: AttemptStatus.REJECTED,
        stage: AttemptStage.FINISHED,
        response: toJson(rejection.getResponse()),
        errorStatus: rejection.getStatus(),
        completedAt: new Date(),
        ownerToken: null,
        leaseExpiresAt: null,
      },
    });
    if (count === 1) throw rejection;
    // Finished meanwhile (COMPLETED or REJECTED): answer with that outcome.
    const finished = await this.prisma.checkoutAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    return this.resolveExisting(finished, request);
  }

  /**
   * Classifies a failed keyed execution. Only outcomes that cannot change
   * are recorded as REJECTED; anything that may still be resumed is
   * released, and anything a provider may have seen is BLOCKED.
   */
  private async recordFailure(
    context: CheckoutAttemptContext,
    error: unknown,
  ): Promise<void> {
    const definite = isDefiniteCheckoutFailure(error);
    const attempt = await this.prisma.checkoutAttempt.findUnique({
      where: { id: context.attemptId },
      select: { orderId: true, status: true, ownerToken: true },
    });
    // Whoever owns the attempt now decides its outcome. A request that lost
    // it (its lease lapsed and a retry claimed it) records nothing; if that
    // owner dies too, lease expiry hands the attempt to the next retry.
    if (
      !attempt ||
      attempt.status !== AttemptStatus.IN_PROGRESS ||
      attempt.ownerToken !== context.ownerToken
    )
      return;

    if (!attempt.orderId) {
      await (definite ? this.reject(context, error) : this.release(context));
      return;
    }

    const payment = await this.paymentsService.findForOrder(attempt.orderId);
    if (!payment) {
      const order = await this.prisma.order.findUnique({
        where: { id: attempt.orderId },
        select: { status: true },
      });
      await (order?.status === OrderStatus.CANCELLED || definite
        ? this.reject(context, error)
        : this.release(context));
      return;
    }

    if (TERMINAL_FAILURE_STATUSES.includes(payment.status))
      await this.reject(context, error);
    else await this.block(context.attemptId, context.ownerToken);
  }

  private async reject(
    context: CheckoutAttemptContext,
    error: unknown,
  ): Promise<void> {
    const { status, response } = recordedRejection(error);
    await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: context.attemptId,
        ownerToken: context.ownerToken,
        status: AttemptStatus.IN_PROGRESS,
      },
      data: {
        status: AttemptStatus.REJECTED,
        stage: AttemptStage.FINISHED,
        response,
        errorStatus: status,
        completedAt: new Date(),
        ownerToken: null,
        leaseExpiresAt: null,
      },
    });
  }

  /** Gives up ownership so the next retry may resume immediately rather than wait out the lease. */
  private async release(context: CheckoutAttemptContext): Promise<void> {
    await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: context.attemptId,
        ownerToken: context.ownerToken,
        status: AttemptStatus.IN_PROGRESS,
      },
      data: { ownerToken: null, leaseExpiresAt: null },
    });
  }

  /**
   * A payment row exists, so the outcome is the provider's, not ours. Any
   * owner when a retry finds the payment; fenced on `ownerToken` when the
   * owner records its own failure.
   */
  private async block(attemptId: string, ownerToken?: string): Promise<void> {
    await this.prisma.checkoutAttempt.updateMany({
      where: {
        id: attemptId,
        status: AttemptStatus.IN_PROGRESS,
        ...(ownerToken ? { ownerToken } : {}),
      },
      data: {
        status: AttemptStatus.BLOCKED,
        ownerToken: null,
        leaseExpiresAt: null,
      },
    });
  }

  private async inProgressConflict(
    orderId: string | null,
  ): Promise<ConflictException> {
    const payment = orderId
      ? await this.paymentsService.findForOrder(orderId)
      : null;
    return checkoutAttemptConflict(
      CHECKOUT_IN_PROGRESS,
      'A checkout with this Idempotency-Key is still in progress; retry with the same key shortly',
      { orderId, paymentId: payment?.id },
    );
  }

  private async reconciliationConflict(
    orderId: string | null,
    paymentId?: string,
  ): Promise<ConflictException> {
    const resolvedPaymentId =
      paymentId ??
      (orderId
        ? (await this.paymentsService.findForOrder(orderId))?.id
        : undefined);
    return checkoutAttemptConflict(
      CHECKOUT_REQUIRES_RECONCILIATION,
      'Payment for this checkout may already have been submitted; check the order and its payment status instead of checking out again',
      { orderId, paymentId: resolvedPaymentId },
    );
  }

  /** The replayable response: plain JSON, never the order's internal cart snapshot. */
  private storedResponse(result: CheckoutResult): Prisma.InputJsonValue {
    const json = JSON.parse(JSON.stringify(result)) as {
      order?: Record<string, unknown>;
    };
    if (json.order) delete json.order.checkoutCartSnapshot;
    return json as Prisma.InputJsonValue;
  }

  private leaseFromNow(): Date {
    return new Date(Date.now() + CHECKOUT_ATTEMPT_LEASE_MS);
  }
}
