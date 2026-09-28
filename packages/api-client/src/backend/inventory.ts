import type {
  BackendInventoryMovement,
  BackendInventoryRecord,
  BackendReservation,
  BackendUpdateWarehouseInput,
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

export function backendUpdateWarehouse(
  client: ApiClient,
  id: string,
  input: BackendUpdateWarehouseInput,
): Promise<BackendWarehouse> {
  return client.patch(`/admin/inventory/warehouses/${id}`, { body: input });
}

/**
 * Deletes a warehouse. One that purchase orders, fulfilment or returns point
 * at cannot go (the database refuses, and the API currently reports that as
 * a server error), but one holding only stock records takes them — and their
 * movement history — with it. Deactivating is the safer way to retire one.
 */
export function backendDeleteWarehouse(
  client: ApiClient,
  id: string,
): Promise<null> {
  return client.delete(`/admin/inventory/warehouses/${id}`);
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

/** Every change to one record's counters, newest first. Not paged. */
export function backendListInventoryMovements(
  client: ApiClient,
  inventoryRecordId: string,
): Promise<BackendInventoryMovement[]> {
  return client.get(`/admin/inventory/${inventoryRecordId}/movements`, {
    cache: 'no-store',
  });
}

/** Every reservation held against one record, in any status, newest first. */
export function backendListInventoryReservations(
  client: ApiClient,
  inventoryRecordId: string,
): Promise<BackendReservation[]> {
  return client.get(`/admin/inventory/${inventoryRecordId}/reservations`, {
    cache: 'no-store',
  });
}
