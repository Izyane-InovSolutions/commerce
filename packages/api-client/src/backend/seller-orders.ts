import type {
  BackendItemsPage,
  BackendSellerOrderListItem,
  BackendSellerOrderDetail,
  BackendFulfillmentStatus,
  BackendOrderStatus,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Orders to fulfil — the seller's slice of each customer order, not the
 * customer's own purchases that `/orders` returns.
 *
 * Read projections include fulfillment progress and concurrency versions.
 * Seller commands are exported from seller-fulfillment.ts.
 */

export type BackendSellerOrderQuery = {
  page?: number;
  limit?: number;
  status?: BackendOrderStatus;
  fulfillmentStatus?: BackendFulfillmentStatus;
  fulfillmentMode?: 'SELLER' | 'PLATFORM';
  dateFrom?: string;
  dateTo?: string;
};

export function backendListSellerOrders(
  client: ApiClient,
  query: BackendSellerOrderQuery = {},
): Promise<BackendItemsPage<BackendSellerOrderListItem>> {
  return client.get('/sellers/me/orders', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetSellerOrder(
  client: ApiClient,
  id: string,
): Promise<BackendSellerOrderDetail> {
  return client.get(`/sellers/me/orders/${id}`, { cache: 'no-store' });
}
