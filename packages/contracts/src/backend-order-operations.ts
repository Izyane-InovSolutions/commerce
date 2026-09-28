import type {
  BackendAdminOrder,
  BackendShipmentStatus,
  BackendTrackingEvent,
} from './backend.ts';

/* ---- admin order detail, fulfillment exceptions, and shipment history ---- */

/**
 * The delivery address as checkout snapshotted it onto the order — a copy,
 * not a live address-book row, so a later edit by the customer never
 * rewrites where an order was sent.
 */
export type BackendAddressSnapshot = {
  label: string | null;
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
};

/** One shipping group as the admin order read nests it under a seller order. */
export type BackendAdminShippingGroup = {
  id: string;
  sellerOrderId: string;
  fulfillmentMode: 'PLATFORM' | 'SELLER';
  serviceLevel: string;
  methodName: string;
  shippingAmount: number;
  currency: string;
  estimatedDeliveryMinDays: number;
  estimatedDeliveryMaxDays: number;
};

/** Who placed the order, as the admin order read joins it in. */
export type BackendAdminOrderCustomer = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

/**
 * An admin order line with the catalog names behind its offer. These are the
 * catalog's current names, not a snapshot — order items don't copy them.
 */
export type BackendAdminOrderItem = BackendAdminOrder['items'][number] & {
  product?: { id: string; name: string; slug: string };
  variant?: { id: string; skuCode: string; name: string | null };
  sellerSku?: string | null;
  listingTitle?: string | null;
};

/**
 * `GET /admin/orders/:id` returns the whole order row, so it carries the
 * address snapshot, the customer, each line's product/variant names, and
 * each seller order's shipping groups on top of what the list schema
 * describes. All are optional here so an older API that trims them still
 * type-checks against the page.
 */
export type BackendAdminOrderDetail = Omit<
  BackendAdminOrder,
  'sellerOrders' | 'items'
> & {
  updatedAt?: string;
  shippingAddress?: BackendAddressSnapshot | null;
  customer?: BackendAdminOrderCustomer;
  items: BackendAdminOrderItem[];
  sellerOrders: (BackendAdminOrder['sellerOrders'][number] & {
    shippingAmount?: number;
    shippingGroups?: BackendAdminShippingGroup[];
  })[];
};

/** Append-only history of one fulfillment order, newest first. */
export type BackendFulfillmentEvent = {
  id: string;
  fulfillmentOrderId: string;
  type: string;
  actorUserId: string | null;
  metadata: unknown;
  createdAt: string;
};

export const backendFulfillmentExceptionKinds = [
  'SHORT_PICK',
  'DAMAGED',
  'MISSING',
] as const;
export type BackendFulfillmentExceptionKind =
  (typeof backendFulfillmentExceptionKinds)[number];

/** An open exception holds the fulfillment order `ON_HOLD` until resolved. */
export type BackendCreateFulfillmentExceptionInput = {
  fulfillmentLineId: string;
  type: BackendFulfillmentExceptionKind;
  quantity: number;
  reason: string;
};

/**
 * `resume` releases the hold as-is; `cancel_quantity` also cancels the
 * exception's quantity off its line (returning the stock).
 */
export type BackendResolveFulfillmentExceptionInput = {
  action: 'resume' | 'cancel_quantity';
  resolution: string;
};

export type BackendCancelFulfillmentLinesInput = {
  lines: { fulfillmentLineId: string; quantity: number }[];
  reason: string;
};

/** The assignee must be an active STAFF user; `version` is the work item's. */
export type BackendAssignWorkItemInput = {
  assigneeUserId: string;
  version: number;
};

export type BackendCancelShipmentInput = { reason: string };

export const backendTrackingEventSources = [
  'CARRIER_WEBHOOK',
  'CARRIER_POLL',
  'ADMIN_MANUAL',
  'ADMIN_CORRECTION',
  'SELLER_MANUAL',
] as const;
export type BackendTrackingEventSource =
  (typeof backendTrackingEventSources)[number];

/** The admin tracking read returns the whole row, including where it came from. */
export type BackendAdminTrackingEvent = BackendTrackingEvent & {
  source: BackendTrackingEventSource;
  rawStatus: string | null;
  actorUserId: string | null;
  createdAt: string;
  normalizedStatus: BackendShipmentStatus;
};
