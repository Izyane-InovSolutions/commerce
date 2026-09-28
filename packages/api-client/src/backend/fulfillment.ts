import type {
  BackendAssignWorkItemInput,
  BackendCancelFulfillmentLinesInput,
  BackendCreateFulfillmentExceptionInput,
  BackendDispatchInput,
  BackendFulfillmentDispatch,
  BackendFulfillmentEvent,
  BackendFulfillmentOrder,
  BackendFulfillmentStatus,
  BackendItemsPage,
  BackendFulfillmentWorkItemType,
  BackendRecordQuantitiesInput,
  BackendResolveFulfillmentExceptionInput,
  BackendVersionInput,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Warehouse fulfillment: picking, packing, and dispatching one
 * (shipping-group, warehouse) slice of an order.
 *
 * Every mutation here takes either the `version` it was decided against or
 * an idempotency key (sometimes both) — the API rejects a stale write and
 * de-duplicates a retried one, so this layer just passes them through.
 */

export type BackendFulfillmentQuery = {
  page?: number;
  limit?: number;
  status?: BackendFulfillmentStatus;
  orderId?: string;
  warehouseId?: string;
  assignedUserId?: string;
};

export function backendListFulfillments(
  client: ApiClient,
  query: BackendFulfillmentQuery = {},
): Promise<BackendItemsPage<BackendFulfillmentOrder>> {
  return client.get('/admin/fulfillments', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetFulfillment(
  client: ApiClient,
  id: string,
): Promise<BackendFulfillmentOrder> {
  return client.get(`/admin/fulfillments/${id}`, { cache: 'no-store' });
}

export function backendStartPicking(
  client: ApiClient,
  id: string,
  input: BackendVersionInput,
): Promise<BackendFulfillmentOrder> {
  return client.post(`/admin/fulfillments/${id}/picking/start`, {
    body: input,
  });
}

export function backendRecordPicks(
  client: ApiClient,
  id: string,
  input: BackendRecordQuantitiesInput,
  idempotencyKey: string,
): Promise<BackendFulfillmentOrder> {
  return client.post(`/admin/fulfillments/${id}/picks`, {
    body: input,
    idempotencyKey,
  });
}

export function backendCompletePicking(
  client: ApiClient,
  id: string,
  input: BackendVersionInput,
): Promise<BackendFulfillmentOrder> {
  return client.post(`/admin/fulfillments/${id}/picking/complete`, {
    body: input,
  });
}

export function backendStartPacking(
  client: ApiClient,
  id: string,
  input: BackendVersionInput,
): Promise<BackendFulfillmentOrder> {
  return client.post(`/admin/fulfillments/${id}/packing/start`, {
    body: input,
  });
}

export function backendRecordPacks(
  client: ApiClient,
  id: string,
  input: BackendRecordQuantitiesInput,
  idempotencyKey: string,
): Promise<BackendFulfillmentOrder> {
  return client.post(`/admin/fulfillments/${id}/packs`, {
    body: input,
    idempotencyKey,
  });
}

export function backendCompletePacking(
  client: ApiClient,
  id: string,
  input: BackendVersionInput,
): Promise<BackendFulfillmentOrder> {
  return client.post(`/admin/fulfillments/${id}/packing/complete`, {
    body: input,
  });
}

export function backendDispatchFulfillment(
  client: ApiClient,
  id: string,
  input: BackendDispatchInput,
  idempotencyKey: string,
): Promise<BackendFulfillmentDispatch> {
  return client.post(`/admin/fulfillments/${id}/dispatches`, {
    body: input,
    idempotencyKey,
  });
}

/** The fulfillment order's own history, newest first. */
export function backendListFulfillmentEvents(
  client: ApiClient,
  id: string,
): Promise<BackendFulfillmentEvent[]> {
  return client.get(`/admin/fulfillments/${id}/events`, { cache: 'no-store' });
}

/** ADMIN-only. `version` is the work item's own, not the fulfillment order's. */
export function backendAssignWorkItem(
  client: ApiClient,
  id: string,
  type: BackendFulfillmentWorkItemType,
  input: BackendAssignWorkItemInput,
): Promise<BackendFulfillmentOrder> {
  return client.post(
    `/admin/fulfillments/${id}/work-items/${type.toLowerCase()}/assign`,
    { body: input },
  );
}

/** Raising an exception puts the whole fulfillment order on hold. */
export function backendCreateFulfillmentException(
  client: ApiClient,
  id: string,
  input: BackendCreateFulfillmentExceptionInput,
): Promise<BackendFulfillmentOrder> {
  return client.post(`/admin/fulfillments/${id}/exceptions`, { body: input });
}

/** ADMIN-only. Resolving an already-resolved exception is a no-op. */
export function backendResolveFulfillmentException(
  client: ApiClient,
  id: string,
  exceptionId: string,
  input: BackendResolveFulfillmentExceptionInput,
): Promise<BackendFulfillmentOrder> {
  return client.post(
    `/admin/fulfillments/${id}/exceptions/${exceptionId}/resolve`,
    { body: input },
  );
}

/** ADMIN-only. Cancels quantity off lines and returns that stock. */
export function backendCancelFulfillmentLines(
  client: ApiClient,
  id: string,
  input: BackendCancelFulfillmentLinesInput,
  idempotencyKey: string,
): Promise<BackendFulfillmentOrder> {
  return client.post(`/admin/fulfillments/${id}/cancellations`, {
    body: input,
    idempotencyKey,
  });
}
