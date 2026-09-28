import type {
  BackendCreateGoodsReceiptInput,
  BackendCreatePurchaseOrderInput,
  BackendCreateSupplierInput,
  BackendCreateSupplierProductInput,
  BackendGoodsReceipt,
  BackendItemsPage,
  BackendPurchaseOrder,
  BackendPurchaseOrderQuery,
  BackendPurchaseOrderReasonInput,
  BackendReverseGoodsReceiptInput,
  BackendSupplier,
  BackendSupplierProduct,
  BackendSupplierStatus,
  BackendUpdatePurchaseOrderInput,
  BackendUpdateSupplierInput,
  BackendUpdateSupplierProductInput,
  BackendVersionInput,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Buying stock in: suppliers, what they sell us, purchase orders against
 * them, and the goods receipts that post delivered stock into a warehouse.
 *
 * Purchase-order transitions each carry the `version` they were decided
 * against, so two people acting on the same PO cannot both win. Approve,
 * reject, and receipt reversal are ADMIN-only on the API; everything else is
 * open to STAFF too.
 */

export type BackendSupplierQuery = {
  page?: number;
  limit?: number;
  status?: BackendSupplierStatus;
};

export function backendListSuppliers(
  client: ApiClient,
  query: BackendSupplierQuery = {},
): Promise<BackendItemsPage<BackendSupplier>> {
  return client.get('/admin/procurement/suppliers', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetSupplier(
  client: ApiClient,
  id: string,
): Promise<BackendSupplier> {
  return client.get(`/admin/procurement/suppliers/${id}`, {
    cache: 'no-store',
  });
}

export function backendCreateSupplier(
  client: ApiClient,
  input: BackendCreateSupplierInput,
): Promise<BackendSupplier> {
  return client.post('/admin/procurement/suppliers', { body: input });
}

export function backendUpdateSupplier(
  client: ApiClient,
  id: string,
  input: BackendUpdateSupplierInput,
): Promise<BackendSupplier> {
  return client.patch(`/admin/procurement/suppliers/${id}`, { body: input });
}

export function backendDeactivateSupplier(
  client: ApiClient,
  id: string,
  input: BackendVersionInput,
): Promise<BackendSupplier> {
  return client.post(`/admin/procurement/suppliers/${id}/deactivate`, {
    body: input,
  });
}

/** Every mapping for one supplier, active or not — unpaged. */
export function backendListSupplierProducts(
  client: ApiClient,
  supplierId: string,
): Promise<BackendSupplierProduct[]> {
  return client.get(`/admin/procurement/suppliers/${supplierId}/products`, {
    cache: 'no-store',
  });
}

export function backendCreateSupplierProduct(
  client: ApiClient,
  supplierId: string,
  input: BackendCreateSupplierProductInput,
): Promise<BackendSupplierProduct> {
  return client.post(`/admin/procurement/suppliers/${supplierId}/products`, {
    body: input,
  });
}

export function backendUpdateSupplierProduct(
  client: ApiClient,
  supplierId: string,
  id: string,
  input: BackendUpdateSupplierProductInput,
): Promise<BackendSupplierProduct> {
  return client.patch(
    `/admin/procurement/suppliers/${supplierId}/products/${id}`,
    { body: input },
  );
}

export function backendListPurchaseOrders(
  client: ApiClient,
  query: BackendPurchaseOrderQuery = {},
): Promise<BackendItemsPage<BackendPurchaseOrder>> {
  return client.get('/admin/procurement/purchase-orders', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetPurchaseOrder(
  client: ApiClient,
  id: string,
): Promise<BackendPurchaseOrder> {
  return client.get(`/admin/procurement/purchase-orders/${id}`, {
    cache: 'no-store',
  });
}

export function backendCreatePurchaseOrder(
  client: ApiClient,
  input: BackendCreatePurchaseOrderInput,
): Promise<BackendPurchaseOrder> {
  return client.post('/admin/procurement/purchase-orders', { body: input });
}

/** Draft-only. */
export function backendUpdatePurchaseOrder(
  client: ApiClient,
  id: string,
  input: BackendUpdatePurchaseOrderInput,
): Promise<BackendPurchaseOrder> {
  return client.patch(`/admin/procurement/purchase-orders/${id}`, {
    body: input,
  });
}

/** The transitions that need only a version. */
export type BackendPurchaseOrderVersionTransition =
  | 'submit'
  | 'approve'
  | 'place';

/** The transitions that need a version and a reason. */
export type BackendPurchaseOrderReasonTransition =
  | 'return-to-draft'
  | 'reject'
  | 'cancel'
  | 'close-short';

export function backendTransitionPurchaseOrder(
  client: ApiClient,
  id: string,
  transition: BackendPurchaseOrderVersionTransition,
  input: BackendVersionInput,
): Promise<BackendPurchaseOrder> {
  return client.post(
    `/admin/procurement/purchase-orders/${id}/${transition}`,
    { body: input },
  );
}

export function backendTransitionPurchaseOrderWithReason(
  client: ApiClient,
  id: string,
  transition: BackendPurchaseOrderReasonTransition,
  input: BackendPurchaseOrderReasonInput,
): Promise<BackendPurchaseOrder> {
  return client.post(
    `/admin/procurement/purchase-orders/${id}/${transition}`,
    { body: input },
  );
}

/**
 * Copies an `APPROVED` or `ORDERED` purchase order into a new `DRAFT`
 * revision. The original is left untouched until someone cancels it.
 */
export function backendRevisePurchaseOrder(
  client: ApiClient,
  id: string,
): Promise<BackendPurchaseOrder> {
  return client.post(`/admin/procurement/purchase-orders/${id}/revise`);
}

export function backendListGoodsReceipts(
  client: ApiClient,
  purchaseOrderId: string,
): Promise<BackendGoodsReceipt[]> {
  return client.get(
    `/admin/procurement/purchase-orders/${purchaseOrderId}/receipts`,
    { cache: 'no-store' },
  );
}

/**
 * Creates a receipt against a purchase order and, unless `post: false`,
 * posts it into stock in the same call. The idempotency key (a UUID v4) makes
 * a retried post return the original receipt instead of receiving twice.
 */
export function backendCreateGoodsReceipt(
  client: ApiClient,
  purchaseOrderId: string,
  input: BackendCreateGoodsReceiptInput,
  idempotencyKey: string,
): Promise<BackendGoodsReceipt> {
  return client.post(
    `/admin/procurement/purchase-orders/${purchaseOrderId}/receipts`,
    { body: input, idempotencyKey },
  );
}

export function backendGetGoodsReceipt(
  client: ApiClient,
  id: string,
): Promise<BackendGoodsReceipt> {
  return client.get(`/admin/procurement/goods-receipts/${id}`, {
    cache: 'no-store',
  });
}

/** Posts a `DRAFT` receipt into stock. */
export function backendPostGoodsReceipt(
  client: ApiClient,
  id: string,
  idempotencyKey: string,
): Promise<BackendGoodsReceipt> {
  return client.post(`/admin/procurement/goods-receipts/${id}/post`, {
    idempotencyKey,
  });
}

/** Abandons a `DRAFT` receipt. A posted one has to be reversed instead. */
export function backendDeleteGoodsReceipt(
  client: ApiClient,
  id: string,
): Promise<void> {
  return client.delete(`/admin/procurement/goods-receipts/${id}`);
}

/** ADMIN-only. Returns the reversing receipt, not the original. */
export function backendReverseGoodsReceipt(
  client: ApiClient,
  id: string,
  input: BackendReverseGoodsReceiptInput,
): Promise<BackendGoodsReceipt> {
  return client.post(`/admin/procurement/goods-receipts/${id}/reverse`, {
    body: input,
  });
}
