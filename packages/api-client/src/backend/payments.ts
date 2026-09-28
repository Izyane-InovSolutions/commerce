import type {
  BackendGatewayPaymentPage,
  BackendGatewayPaymentQuery,
  BackendPaymentSnapshot,
  BackendRefund,
  BackendRefundPaymentInput,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Payments and refunds from the admin side.
 *
 * The payment list is the gateway's, passed straight through — its paging is
 * zero-based and its amounts are major units. Refund money moves through a
 * refund case against one seller's slice of an order; the payment-level
 * refund exists as a route but the API refuses it, pointing back here.
 */

export function backendListGatewayPayments(
  client: ApiClient,
  query: BackendGatewayPaymentQuery = {},
): Promise<BackendGatewayPaymentPage> {
  return client.get('/admin/payments', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/** Refunds a whole payment. Idempotency-keyed; the key must be a UUID v4. */
export function backendRefundPayment(
  client: ApiClient,
  paymentId: string,
  input: BackendRefundPaymentInput,
  idempotencyKey: string,
): Promise<BackendPaymentSnapshot> {
  return client.post(`/admin/payments/${paymentId}/refund`, {
    body: input,
    idempotencyKey,
  });
}

/**
 * Refunds part or all of one seller order — opens an ADMIN refund case and
 * returns its first provider attempt. Idempotency-keyed; UUID v4.
 */
export function backendRefundSellerOrder(
  client: ApiClient,
  sellerOrderId: string,
  input: BackendRefundPaymentInput,
  idempotencyKey: string,
): Promise<BackendRefund> {
  return client.post(`/admin/seller-orders/${sellerOrderId}/refund`, {
    body: input,
    idempotencyKey,
  });
}

/**
 * Re-asks the provider about a refund attempt still in flight and applies the
 * answer to its refund case. Takes nothing but the attempt id; an attempt
 * that is already settled comes back unchanged.
 */
export function backendReconcileRefund(
  client: ApiClient,
  refundId: string,
): Promise<BackendRefund> {
  return client.post(`/admin/refunds/${refundId}/status`, { body: {} });
}
