import { DEFAULT_RESERVATION_TTL_SECONDS } from '../../inventory/inventory.service';

// Kept apart from the handler: OrdersService enqueues this job, and the
// handler depends on OrdersService, so sharing one file would be an import
// cycle that leaves the handler's injected OrdersService undefined.

export const UNPAID_ORDER_EXPIRY_JOB_TYPE = 'orders.expire_unpaid';

export type UnpaidOrderExpiryPayload = { orderId: string };

/**
 * Runs once the order's reservations have lapsed (their own expiry jobs run
 * at the TTL), so an order the reaper finds still unpaid can no longer be
 * resumed and only ever has stock left to give back.
 */
export const UNPAID_ORDER_EXPIRY_DELAY_MS =
  DEFAULT_RESERVATION_TTL_SECONDS * 1_000 + 60_000;

/**
 * Retries while a checkout request still owns the order (its lease is
 * live); with the 60s backoff cap this outlasts several leases.
 */
export const UNPAID_ORDER_EXPIRY_MAX_ATTEMPTS = 20;
