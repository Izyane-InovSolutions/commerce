import type {
  BackendAdminAttention,
  BackendSalesAnalytics,
  BackendSalesAnalyticsQuery,
  BackendSellerAttention,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Paid-order sales over a date range, bucketed by `interval` (UTC buckets;
 * weeks start on Monday), with totals and the best-selling products.
 */
export function backendGetSalesAnalytics(
  client: ApiClient,
  query: Partial<BackendSalesAnalyticsQuery> = {},
): Promise<BackendSalesAnalytics> {
  return client.get('/admin/analytics/sales', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/** Queues waiting on staff, and stock running out. */
export function backendGetAdminAttention(
  client: ApiClient,
): Promise<BackendAdminAttention> {
  return client.get('/admin/analytics/attention', { cache: 'no-store' });
}

/** The signed-in seller's sales report — the same shape, over their own
 * order lines, without `topSellers`. */
export function backendGetSellerSalesAnalytics(
  client: ApiClient,
  query: Partial<BackendSalesAnalyticsQuery> = {},
): Promise<BackendSalesAnalytics> {
  return client.get('/sellers/me/analytics/sales', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/** The signed-in seller's queues, stock alerts and rating. */
export function backendGetSellerAttention(
  client: ApiClient,
): Promise<BackendSellerAttention> {
  return client.get('/sellers/me/analytics/attention', { cache: 'no-store' });
}
