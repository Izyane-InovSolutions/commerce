import type {
  BackendAdminOrder,
  BackendAdminOrderDetail,
  BackendItemsPage,
  BackendOrderStatus,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/** Every customer order, across every buyer — the admin's read, not "my orders". */

export type BackendAdminOrderQuery = {
  page?: number;
  limit?: number;
  status?: BackendOrderStatus;
};

export function backendListAdminOrders(
  client: ApiClient,
  query: BackendAdminOrderQuery = {},
): Promise<BackendItemsPage<BackendAdminOrder>> {
  return client.get('/admin/orders', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/** The single-order read carries the address snapshot and shipping groups too. */
export function backendGetAdminOrder(
  client: ApiClient,
  id: string,
): Promise<BackendAdminOrderDetail> {
  return client.get(`/admin/orders/${id}`, { cache: 'no-store' });
}

/**
 * Cancels an order that was never paid. The API refuses (409) once the order
 * has left `PENDING_PAYMENT` — a paid order is unwound through refunds and
 * fulfillment cancellations instead.
 */
export function backendCancelAdminOrder(
  client: ApiClient,
  id: string,
): Promise<BackendAdminOrderDetail> {
  return client.post(`/admin/orders/${id}/cancel`);
}
