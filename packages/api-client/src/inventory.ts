import type {
  AdjustInventoryInput,
  InventoryLevel,
  InventoryListQuery,
  InventoryLocation,
  Paginated,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from './client';

/**
 * Inventory endpoints.
 *
 * Adjustments post a signed delta rather than a new absolute quantity, so two
 * concurrent corrections add up instead of overwriting one another.
 */

export function listInventory(
  client: ApiClient,
  query: Partial<InventoryListQuery> = {},
): Promise<Paginated<InventoryLevel>> {
  return client.get('/inventory', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function adjustInventory(
  client: ApiClient,
  input: AdjustInventoryInput,
): Promise<InventoryLevel> {
  return client.post('/inventory/adjustments', { body: input });
}

export function listLocations(client: ApiClient): Promise<InventoryLocation[]> {
  return client.get('/locations', { cache: 'no-store' });
}
