import type {
  BackendInventoryRecord,
  BackendWarehouse,
} from '@commerce/contracts';

import type { ApiClient } from '../client.ts';

/**
 * Inventory endpoints.
 *
 * Records are keyed by variant and warehouse and carry no product or SKU
 * names, so a caller that wants to label them joins against the catalog.
 */

export function backendListWarehouses(
  client: ApiClient,
): Promise<BackendWarehouse[]> {
  return client.get('/admin/inventory/warehouses', { cache: 'no-store' });
}

export function backendCreateWarehouse(
  client: ApiClient,
  input: { name: string; code: string },
): Promise<BackendWarehouse> {
  return client.post('/admin/inventory/warehouses', { body: input });
}

export function backendListInventory(
  client: ApiClient,
): Promise<BackendInventoryRecord[]> {
  return client.get('/admin/inventory', { cache: 'no-store' });
}

/** Adds stock. Quantity is positive. */
export function backendReceiveStock(
  client: ApiClient,
  input: {
    warehouseId: string;
    variantId: string;
    quantity: number;
    note?: string;
  },
): Promise<BackendInventoryRecord> {
  return client.post('/admin/inventory/receive', { body: input });
}

/** Corrects stock by a signed delta. */
export function backendAdjustStock(
  client: ApiClient,
  input: {
    warehouseId: string;
    variantId: string;
    delta: number;
    note?: string;
  },
): Promise<BackendInventoryRecord> {
  return client.post('/admin/inventory/adjust', { body: input });
}

export function backendUpdateReorderPoint(
  client: ApiClient,
  inventoryRecordId: string,
  reorderPoint: number,
): Promise<BackendInventoryRecord> {
  return client.patch(`/admin/inventory/${inventoryRecordId}/reorder-point`, {
    body: { reorderPoint },
  });
}
