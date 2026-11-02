import { OrderWithItems } from '../orders/orders.service';
import { PaymentWithRedirect } from '../payments/payments.service';

export type CheckoutResult = {
  order: OrderWithItems;
  payment: PaymentWithRedirect;
};

export type { CheckoutQuote } from '../orders/orders.service';

/**
 * A validated `Idempotency-Key`. Attempts are scoped by the lowercased `key`;
 * `rawKey` is the header exactly as sent, because orders checked out before
 * attempt receipts existed stored it verbatim.
 */
export type CheckoutIdempotencyKey = { key: string; rawKey: string };

/**
 * Handed to CheckoutService for a keyed request this process now owns.
 * `ownerToken` fences every write; `resumeOrderId` is an order an earlier,
 * interrupted owner created that never reached payment.
 */
export type CheckoutAttemptContext = {
  attemptId: string;
  ownerToken: string;
  resumeOrderId?: string;
};
