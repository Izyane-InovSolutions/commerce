import type { BackendOperationsMetrics } from '@commerce/contracts';
import type { ApiClient, QueryValue } from '../client.ts';

export type BackendOperationsQuery = {
  from?: string;
  to?: string;
  warehouseId?: string;
  orderStatuses?: string[];
  fulfillmentStatuses?: string[];
  returnStatuses?: string[];
};

export function backendGetOperationsMetrics(
  client: ApiClient,
  query: BackendOperationsQuery = {},
): Promise<BackendOperationsMetrics> {
  const normalized = {
    ...query,
    orderStatuses: query.orderStatuses?.join(','),
    fulfillmentStatuses: query.fulfillmentStatuses?.join(','),
    returnStatuses: query.returnStatuses?.join(','),
  };
  return client.get('/admin/operations/metrics', {
    query: normalized as Record<string, QueryValue>,
    cache: 'no-store',
  });
}
