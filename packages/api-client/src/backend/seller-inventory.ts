import type {
  BackendBulkSellerInventoryInput,
  BackendSellerInventoryRecord,
  BackendSetSellerInventoryInput,
} from '@commerce/contracts';

import type { ApiClient } from '../client.ts';

/**
 * A seller's own stock for their self-managed (`stockSource: 'SELLER'`)
 * offers — platform-stocked offers aren't listed here at all, and the API
 * rejects a write against one. Every write carries the record's own
 * `version`; the API rejects a stale one rather than overwriting a
 * concurrent edit.
 */

export function backendListSellerInventory(
  client: ApiClient,
): Promise<BackendSellerInventoryRecord[]> {
  return client.get('/sellers/me/inventory', { cache: 'no-store' });
}

export function backendSetSellerInventory(
  client: ApiClient,
  offerId: string,
  input: BackendSetSellerInventoryInput,
): Promise<BackendSellerInventoryRecord> {
  return client.put(`/sellers/me/inventory/${offerId}`, { body: input });
}

export function backendBulkSetSellerInventory(
  client: ApiClient,
  input: BackendBulkSellerInventoryInput,
): Promise<BackendSellerInventoryRecord[]> {
  return client.patch('/sellers/me/inventory/bulk', { body: input });
}
