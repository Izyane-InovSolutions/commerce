import { z } from 'zod';

/* ---- payments, as the gateway reports them, and refunds ---- */

/**
 * A payment as the in-house gateway describes it.
 *
 * This is the gateway's record, not the platform's: `amount` is in *major*
 * units of `currency` (the gateway's own convention — the API converts to
 * minor units only when it compares against a local payment), `paymentId` is
 * the gateway's id, and `reference` is the order id the platform sent when it
 * initialised the payment.
 */
export type BackendGatewayPayment = {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  reference: string;
  failureCode?: string;
  failureMessage?: string;
  completedAt?: string;
  expiresAt?: string;
};

/**
 * The gateway's own paging, passed through unchanged — zero-based `page`,
 * `size` rather than `limit`, and `totalElements` rather than `total`.
 */
export type BackendGatewayPaymentPage = {
  content: BackendGatewayPayment[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
};

export type BackendGatewayPaymentQuery = {
  /** Zero-based. */
  page?: number;
  size?: number;
  sortBy?: 'createdAt';
  descending?: 'true' | 'false';
};

/**
 * What a refund asks for — mirrors `RefundPaymentDto`, which both the payment
 * refund and the seller-order refund accept.
 */
export const backendRefundPaymentSchema = z.object({
  amount: z
    .int()
    .min(1, 'Enter an amount above zero.')
    .max(2147483647, 'That amount is too large.'),
  reason: z
    .string()
    .trim()
    .min(3, 'Give a reason of at least 3 characters.')
    .max(500, 'Keep the reason under 500 characters.'),
});
export type BackendRefundPaymentInput = z.input<
  typeof backendRefundPaymentSchema
>;

/** The platform's view of one payment, reconciled against the gateway's. */
export type BackendPaymentSnapshot = {
  id: string;
  orderId: string;
  localStatus: string;
  gateway: BackendGatewayPayment;
  requiresReconciliation: boolean;
};

export const backendRefundStatuses = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
export type BackendRefundStatus = (typeof backendRefundStatuses)[number];

/**
 * One provider refund attempt. A refund case (see `BackendRefundCase`) owns
 * one or more of these; a retry adds another.
 */
export type BackendRefund = {
  id: string;
  paymentId: string;
  sellerOrderId: string;
  refundCaseId: string | null;
  amount: number;
  currency: string;
  reason: string;
  status: BackendRefundStatus;
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};
