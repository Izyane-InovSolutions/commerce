import { apiClient } from './api';
import type { SuccessEnvelope } from './catalog-types';
import type {
  ReturnEligibility,
  ReturnRequest,
  ReturnRequestInput,
} from './return-types';

/**
 * Returns against a delivered order: whether each line can go back, asking
 * for it, and following the request through to a refund.
 *
 * Every route answers 404 for an order or return that is not the caller's
 * own, so nothing here has to check ownership itself.
 */

/** Per order line: returnable at all, and how many are still within the
 * window and not already claimed by another return. */
export async function getReturnEligibility(
  orderId: string,
): Promise<ReturnEligibility[]> {
  const response = await apiClient.get<SuccessEnvelope<ReturnEligibility[]>>(
    `/orders/${encodeURIComponent(orderId)}/return-eligibility`,
    { cache: 'no-store' },
  );
  return response.data;
}

/**
 * The idempotency key is required by the API, and minted by the form rather
 * than here, so a double submit is the same request instead of a second
 * return claiming the same units.
 */
export async function requestReturn(
  orderId: string,
  input: ReturnRequestInput,
  idempotencyKey: string,
): Promise<ReturnRequest> {
  const response = await apiClient.post<SuccessEnvelope<ReturnRequest>>(
    `/orders/${encodeURIComponent(orderId)}/returns`,
    { body: input, idempotencyKey },
  );
  return response.data;
}

/** Newest first, across every order. */
export async function listReturns(): Promise<ReturnRequest[]> {
  const response = await apiClient.get<SuccessEnvelope<ReturnRequest[]>>(
    '/returns',
    { cache: 'no-store' },
  );
  return response.data;
}

export async function getReturn(returnId: string): Promise<ReturnRequest> {
  const response = await apiClient.get<SuccessEnvelope<ReturnRequest>>(
    `/returns/${encodeURIComponent(returnId)}`,
    { cache: 'no-store' },
  );
  return response.data;
}

/**
 * Withdraws a return while it is still only requested. `version` is the one
 * the shopper was looking at: if staff have acted on it since, the API
 * answers 409 rather than cancelling something that has moved on.
 */
export async function cancelReturn(
  returnId: string,
  version: number,
): Promise<ReturnRequest> {
  const response = await apiClient.post<SuccessEnvelope<ReturnRequest>>(
    `/returns/${encodeURIComponent(returnId)}/cancel`,
    { body: { version } },
  );
  return response.data;
}
