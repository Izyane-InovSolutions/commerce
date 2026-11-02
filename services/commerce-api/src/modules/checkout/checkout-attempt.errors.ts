import { ConflictException, HttpException } from '@nestjs/common';

// Deliberately free of orders/cart/payments imports: OrdersService imports the
// fence error and lease from here, and CheckoutModule already depends on it.

/**
 * How long an executing request owns its checkout attempt before a retry with
 * the same key may take it over. Renewed when the order is linked and again
 * when payment starts; every owner write is fenced on the owner token, so a
 * misjudged lease costs a 409, never a second order or charge.
 */
export const CHECKOUT_ATTEMPT_LEASE_MS = 120_000;

/** The key was already used for a different checkout request. */
export const CHECKOUT_KEY_REUSED = 'CHECKOUT_KEY_REUSED';
/**
 * The key belongs to a checkout recorded before receipts were fingerprinted
 * with the current keyring, so a retry can be neither compared nor replayed.
 */
export const CHECKOUT_KEY_LEGACY_RECEIPT = 'CHECKOUT_KEY_LEGACY_RECEIPT';
/** Another request currently owns this key; retry the same key later. */
export const CHECKOUT_IN_PROGRESS = 'CHECKOUT_IN_PROGRESS';
/** Payment may have been submitted; the order must be reconciled, never retried. */
export const CHECKOUT_REQUIRES_RECONCILIATION =
  'CHECKOUT_REQUIRES_RECONCILIATION';
/** The interrupted checkout's reservations lapsed before payment started. */
export const CHECKOUT_EXPIRED = 'CHECKOUT_EXPIRED';
/**
 * The checkout's payment was definitively refused (FAILED or CANCELLED) and
 * its order cancelled, but the request that saw it never recorded that
 * outcome; nothing was charged and the key can never succeed.
 */
export const CHECKOUT_PAYMENT_FAILED = 'CHECKOUT_PAYMENT_FAILED';

export type CheckoutAttemptErrorCode =
  | typeof CHECKOUT_KEY_REUSED
  | typeof CHECKOUT_KEY_LEGACY_RECEIPT
  | typeof CHECKOUT_IN_PROGRESS
  | typeof CHECKOUT_REQUIRES_RECONCILIATION
  | typeof CHECKOUT_EXPIRED
  | typeof CHECKOUT_PAYMENT_FAILED;

export type CheckoutAttemptRefs = {
  orderId?: string | null;
  paymentId?: string | null;
};

/**
 * The answer recorded for a key whose order was given up before any payment
 * existed — by a retry that found the reservations lapsed, or by the
 * unpaid-order reaper. One builder, so every path replays the same body.
 */
export function checkoutExpiredConflict(orderId: string): ConflictException {
  return checkoutAttemptConflict(
    CHECKOUT_EXPIRED,
    'This checkout expired before payment started; check out again with a new Idempotency-Key',
    { orderId },
  );
}

/**
 * A 409 whose machine-readable code and references survive the global
 * AllExceptionsFilter, which keeps `details` entries shaped { field, message }.
 */
export function checkoutAttemptConflict(
  code: CheckoutAttemptErrorCode,
  message: string,
  refs: CheckoutAttemptRefs = {},
): ConflictException {
  return new ConflictException(checkoutAttemptErrorBody(code, message, refs));
}

function checkoutAttemptErrorBody(
  code: CheckoutAttemptErrorCode,
  message: string,
  { orderId, paymentId }: CheckoutAttemptRefs,
): { message: string; details: { field: string; message: string }[] } {
  return {
    message,
    details: [
      { field: 'code', message: code },
      ...(orderId ? [{ field: 'orderId', message: orderId }] : []),
      ...(paymentId ? [{ field: 'paymentId', message: paymentId }] : []),
    ],
  };
}

/**
 * A deliberate client-facing refusal: retrying the same request cannot
 * succeed, so it is safe to record as the key's final answer. Anything else
 * (5xx, database or network errors) may be transient and is never recorded
 * as a rejection while the outcome can still change.
 */
export function isDefiniteCheckoutFailure(error: unknown): boolean {
  return error instanceof HttpException && error.getStatus() < 500;
}

/**
 * Thrown by a fenced write when this request no longer owns its attempt (a
 * retry took it over after the lease lapsed). Nothing was written, no payment
 * was created, and the request that now owns the key decides the outcome.
 */
export class CheckoutAttemptSupersededError extends ConflictException {
  constructor() {
    super(
      checkoutAttemptErrorBody(
        CHECKOUT_IN_PROGRESS,
        'A retry of this checkout took it over; retry with the same Idempotency-Key to see its outcome',
        {},
      ),
    );
  }
}
