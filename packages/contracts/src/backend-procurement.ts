/* ---- procurement: suppliers, purchase orders, and goods receipts ---- */

/**
 * Shapes as `admin/procurement/*` returns and accepts them. Every amount is
 * integer minor units, every quantity is in the supplier's purchasing unit
 * (a case, not an each — `packSize` converts), and every mutable row carries
 * the `version` the next write has to quote back.
 */

export const backendSupplierStatuses = ['ACTIVE', 'INACTIVE'] as const;
export type BackendSupplierStatus = (typeof backendSupplierStatuses)[number];

/**
 * A supplier is deactivated, never deleted, once a purchase order names it —
 * the PO history has to keep resolving.
 */
export type BackendSupplier = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: Record<string, unknown> | null;
  physicalAddress: Record<string, unknown> | null;
  defaultCurrency: string;
  paymentTermsDays: number;
  leadTimeDays: number;
  minimumOrderAmount: number | null;
  minimumOrderCurrency: string | null;
  status: BackendSupplierStatus;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/** Mirrors `CreateSupplierDto`. `code` is uppercase letters, digits, `-`, `_`. */
export type BackendCreateSupplierInput = {
  code: string;
  legalName: string;
  tradingName?: string;
  registrationNumber?: string;
  taxNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  defaultCurrency?: string;
  paymentTermsDays?: number;
  leadTimeDays?: number;
  minimumOrderAmount?: number;
  minimumOrderCurrency?: string;
  notes?: string;
};

/**
 * Mirrors `UpdateSupplierDto` — `code` and `defaultCurrency` are fixed once
 * the supplier exists, so neither is accepted here.
 */
export type BackendUpdateSupplierInput = {
  version: number;
  legalName?: string;
  tradingName?: string;
  registrationNumber?: string;
  taxNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  paymentTermsDays?: number;
  leadTimeDays?: number;
  minimumOrderAmount?: number;
  minimumOrderCurrency?: string;
  notes?: string;
};

/** How one supplier sells one of our variants. At most one per pair. */
export type BackendSupplierProduct = {
  id: string;
  supplierId: string;
  variantId: string;
  supplierSku: string;
  description: string | null;
  packSize: number;
  minimumOrderQty: number;
  unitOfMeasure: string;
  defaultUnitCost: number;
  lastUnitCost: number | null;
  currency: string;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BackendCreateSupplierProductInput = {
  variantId: string;
  supplierSku: string;
  description?: string;
  packSize?: number;
  minimumOrderQty?: number;
  unitOfMeasure?: string;
  defaultUnitCost: number;
  currency: string;
  leadTimeDays?: number;
  isPreferred?: boolean;
};

/** Neither the variant nor the currency can change on an existing mapping. */
export type BackendUpdateSupplierProductInput = {
  supplierSku?: string;
  description?: string;
  packSize?: number;
  minimumOrderQty?: number;
  unitOfMeasure?: string;
  defaultUnitCost?: number;
  leadTimeDays?: number;
  isPreferred?: boolean;
  isActive?: boolean;
};

export const backendPurchaseOrderStatuses = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED_SHORT',
  'CANCELLED',
] as const;
export type BackendPurchaseOrderStatus =
  (typeof backendPurchaseOrderStatuses)[number];

/**
 * Costs are snapshotted at order time. `receivedQuantity` and
 * `cancelledQuantity` only ever grow (a reversed receipt shrinks
 * `receivedQuantity` again); what is still outstanding is derived from the
 * three together rather than stored.
 */
export type BackendPurchaseOrderLine = {
  id: string;
  purchaseOrderId: string;
  variantId: string;
  supplierSku: string | null;
  packSize: number;
  orderedQuantity: number;
  receivedQuantity: number;
  cancelledQuantity: number;
  unitCostAmount: number;
  discountAmount: number;
  taxRateBasisPoints: number;
  taxAmount: number;
  netAmount: number;
  grossAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type BackendPurchaseOrder = {
  id: string;
  poNumber: string;
  supplierId: string;
  warehouseId: string;
  status: BackendPurchaseOrderStatus;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  expectedDeliveryDate: string | null;
  notes: string | null;
  version: number;
  revisionNumber: number;
  /** The purchase order this revision replaces, if it is one. */
  supersedesId: string | null;
  createdByUserId: string;
  approvedByUserId: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  shortCloseReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: BackendPurchaseOrderLine[];
};

/** Mirrors `CreatePurchaseOrderLineDto`. Tax is basis points: 1600 is 16%. */
export type BackendPurchaseOrderLineInput = {
  variantId: string;
  supplierSku?: string;
  packSize?: number;
  orderedQuantity: number;
  unitCostAmount: number;
  discountAmount?: number;
  taxRateBasisPoints?: number;
};

export type BackendCreatePurchaseOrderInput = {
  supplierId: string;
  warehouseId: string;
  currency: string;
  shippingAmount?: number;
  /** An ISO date string. */
  expectedDeliveryDate?: string;
  notes?: string;
  lines: BackendPurchaseOrderLineInput[];
};

/**
 * Only accepted while the purchase order is still `DRAFT`. Sending `lines`
 * replaces every line; leaving it out keeps them.
 */
export type BackendUpdatePurchaseOrderInput = Partial<
  Omit<BackendCreatePurchaseOrderInput, 'lines'>
> & {
  version: number;
  lines?: BackendPurchaseOrderLineInput[];
};

/** Return-to-draft, reject, cancel, and close-short all need a reason. */
export type BackendPurchaseOrderReasonInput = {
  version: number;
  reason: string;
};

export type BackendPurchaseOrderQuery = {
  page?: number;
  limit?: number;
  status?: BackendPurchaseOrderStatus;
  supplierId?: string;
  warehouseId?: string;
  /**
   * The API coerces these with `Boolean(value)`, so the string `"false"` is
   * truthy there — send `true` or leave them out.
   */
  overdue?: true;
  awaitingApproval?: true;
};

export const backendGoodsReceiptStatuses = [
  'DRAFT',
  'POSTED',
  'REVERSED',
] as const;
export type BackendGoodsReceiptStatus =
  (typeof backendGoodsReceiptStatuses)[number];

/**
 * `deliveredQuantity` must equal accepted + rejected + damaged; only the
 * accepted part ever reaches inventory.
 */
export type BackendGoodsReceiptLine = {
  id: string;
  goodsReceiptId: string;
  purchaseOrderLineId: string;
  deliveredQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  damagedQuantity: number;
  authorizedExcessQty: number;
  discrepancyReason: string | null;
  inventoryMovementId: string | null;
  createdAt: string;
};

/**
 * A posted receipt is immutable. Reversing one posts a second receipt
 * (`reversalOfId` pointing back) and marks the original `REVERSED`.
 */
export type BackendGoodsReceipt = {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  warehouseId: string;
  status: BackendGoodsReceiptStatus;
  supplierDeliveryNoteRef: string | null;
  receivedByUserId: string;
  postedByUserId: string | null;
  reversedByUserId: string | null;
  reversalReason: string | null;
  reversalOfId: string | null;
  idempotencyKey: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: BackendGoodsReceiptLine[];
};

export type BackendGoodsReceiptLineInput = {
  purchaseOrderLineId: string;
  deliveredQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity?: number;
  damagedQuantity?: number;
  /** Non-zero is ADMIN-only — enforced by the API. */
  authorizedExcessQty?: number;
  /** Required when a line is rejected, damaged, or over-received. */
  discrepancyReason?: string;
};

export type BackendCreateGoodsReceiptInput = {
  /** Must match the purchase order's own warehouse. */
  warehouseId: string;
  supplierDeliveryNoteRef?: string;
  /** Defaults to `true`: create and post in one call. */
  post?: boolean;
  lines: BackendGoodsReceiptLineInput[];
};

export type BackendReverseGoodsReceiptInput = { reason: string };
