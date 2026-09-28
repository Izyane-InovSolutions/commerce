import type {
  BackendSalesAnalytics,
  BackendSalesAnalyticsQuery,
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
