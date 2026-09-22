import type { BackendItemsPage, BackendSellerOrder } from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Orders to fulfil — the seller's slice of each customer order, not the
 * customer's own purchases that `/orders` returns.
 *
 * Read-only for now: status moves in lockstep with the parent order, so
 * there is nothing here for a seller to advance yet.
 */

export type BackendSellerOrderQuery = { page?: number; limit?: number };

export function backendListSellerOrders(
  client: ApiClient,
  query: BackendSellerOrderQuery = {},
): Promise<BackendItemsPage<BackendSellerOrder>> {
  return client.get('/sellers/me/orders', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetSellerOrder(
  client: ApiClient,
  id: string,
): Promise<BackendSellerOrder> {
  return client.get(`/sellers/me/orders/${id}`, { cache: 'no-store' });
}
