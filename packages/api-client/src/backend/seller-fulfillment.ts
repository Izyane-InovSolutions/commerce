import type {
  BackendItemsPage,
  BackendRecordQuantitiesInput,
  BackendSellerFulfillmentAction,
  BackendSellerDispatchInput,
  BackendSellerDispatchResult,
  BackendSellerTrackingInput,
  BackendSellerReturnLine,
  BackendReturnStatus,
  BackendSellerShipmentMutation,
} from '@commerce/contracts';
import type { ApiClient, QueryValue } from '../client.ts';

export function backendAcceptSellerFulfillment(
  client: ApiClient,
  id: string,
  version: number,
): Promise<BackendSellerFulfillmentAction> {
  return client.post(`/sellers/me/fulfillments/${id}/accept`, {
    body: { version },
  });
}
export function backendRejectSellerFulfillment(
  client: ApiClient,
  id: string,
  input: { version: number; reason: string },
  idempotencyKey: string,
): Promise<BackendSellerFulfillmentAction> {
  return client.post(`/sellers/me/fulfillments/${id}/reject`, {
    body: input,
    idempotencyKey,
  });
}
export function backendPackSellerFulfillment(
  client: ApiClient,
  id: string,
  input: BackendRecordQuantitiesInput,
  idempotencyKey: string,
): Promise<BackendSellerFulfillmentAction> {
  return client.post(`/sellers/me/fulfillments/${id}/packs`, {
    body: input,
    idempotencyKey,
  });
}
export function backendCancelSellerFulfillment(
  client: ApiClient,
  id: string,
  input: BackendRecordQuantitiesInput & { reason: string },
  idempotencyKey: string,
): Promise<BackendSellerFulfillmentAction> {
  return client.post(`/sellers/me/fulfillments/${id}/cancellations`, {
    body: input,
    idempotencyKey,
  });
}
export function backendDispatchSellerFulfillment(
  client: ApiClient,
  id: string,
  input: BackendSellerDispatchInput,
  idempotencyKey: string,
): Promise<BackendSellerDispatchResult> {
  return client.post(`/sellers/me/fulfillments/${id}/dispatches`, {
    body: input,
    idempotencyKey,
  });
}
export function backendTrackSellerShipment(
  client: ApiClient,
  id: string,
  input: BackendSellerTrackingInput,
  idempotencyKey: string,
): Promise<BackendSellerShipmentMutation> {
  return client.post(`/sellers/me/shipments/${id}/tracking-events`, {
    body: input,
    idempotencyKey,
  });
}
export function backendListSellerReturns(
  client: ApiClient,
  query: {
    page?: number;
    limit?: number;
    status?: BackendReturnStatus;
    dateFrom?: string;
    dateTo?: string;
  } = {},
): Promise<BackendItemsPage<BackendSellerReturnLine>> {
  return client.get('/sellers/me/returns', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}
