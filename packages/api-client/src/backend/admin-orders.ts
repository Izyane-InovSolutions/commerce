import type {
  BackendAdminOrder,
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

export function backendGetAdminOrder(
  client: ApiClient,
  id: string,
): Promise<BackendAdminOrder> {
  return client.get(`/admin/orders/${id}`, { cache: 'no-store' });
}
