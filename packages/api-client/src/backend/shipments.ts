import type {
  BackendAddTrackingEventInput,
  BackendCreateShipmentInput,
  BackendItemsPage,
  BackendShipment,
  BackendShipmentStatus,
  BackendTrackingEvent,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Shipments: booked against already-packed quantity, then dispatched.
 *
 * `create` allocates the packed quantity named in `lines` and leaves the
 * shipment `PENDING_BOOKING`; `book` is the separate step that actually
 * reserves it with a carrier and is what `FulfillmentsService.dispatch`
 * requires before it will accept the shipment.
 */

export type BackendShipmentQuery = {
  page?: number;
  limit?: number;
  status?: BackendShipmentStatus;
  warehouseId?: string;
  fulfillmentOrderId?: string;
};

export function backendListShipments(
  client: ApiClient,
  query: BackendShipmentQuery = {},
): Promise<BackendItemsPage<BackendShipment>> {
  return client.get('/admin/shipments', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetShipment(
  client: ApiClient,
  id: string,
): Promise<BackendShipment> {
  return client.get(`/admin/shipments/${id}`, { cache: 'no-store' });
}

export function backendCreateShipment(
  client: ApiClient,
  input: BackendCreateShipmentInput,
  idempotencyKey: string,
): Promise<BackendShipment> {
  return client.post('/admin/shipments', { body: input, idempotencyKey });
}

export function backendBookShipment(
  client: ApiClient,
  id: string,
): Promise<BackendShipment> {
  return client.post(`/admin/shipments/${id}/book`);
}

export function backendAddTrackingEvent(
  client: ApiClient,
  id: string,
  input: BackendAddTrackingEventInput,
): Promise<BackendTrackingEvent> {
  return client.post(`/admin/shipments/${id}/tracking-events`, { body: input });
}
