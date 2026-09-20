import type {
  FulfillmentEvent,
  FulfillmentLine,
  FulfillmentStatus,
  OfferFulfillmentMode,
  OrderItem,
  SellerOrder,
  ShipmentStatus,
  TrackingEventSource,
} from '@prisma/client';

import type { SellerDestinationView } from './destination-summary';
import type { SellerReturnLineView } from '../returns/seller-returns.types';

export type SellerOrderPage<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

// -- list row (GET /sellers/me/orders) --------------------------------------

export type SellerOrderFulfillmentSummary = {
  id: string;
  shippingGroupId: string;
  fulfillmentMode: OfferFulfillmentMode;
  status: FulfillmentStatus;
  awaitingAcceptance: boolean;
  acceptedAt: Date | null;
};

export type SellerOrderShipmentSummary = {
  count: number;
  // Keyed by ShipmentStatus; only statuses present among this order's
  // shipments appear, so an empty {} means no shipments booked yet.
  statuses: Partial<Record<ShipmentStatus, number>>;
};

// Return counts are grouped by the parent ReturnRequest's lifecycle status
// (ReturnItem itself carries no status of its own) - see
// seller-return-projection.ts for the same convention used by the detailed
// return projection.
export type SellerOrderReturnSummary = {
  total: number;
  byStatus: Record<string, number>;
};

export type SellerOrderListItem = SellerOrder & {
  items: OrderItem[];
  fulfillmentOrders: SellerOrderFulfillmentSummary[];
  shipments: SellerOrderShipmentSummary;
  returns: SellerOrderReturnSummary;
};

// -- detail (GET /sellers/me/orders/:id) -------------------------------------

export type SellerFulfillmentLineView = Pick<
  FulfillmentLine,
  | 'id'
  | 'orderItemId'
  | 'variantId'
  | 'allocatedQuantity'
  | 'pickedQuantity'
  | 'packedQuantity'
  | 'shipmentAssignedQuantity'
  | 'dispatchedQuantity'
  | 'cancelledQuantity'
>;

export type SellerFulfillmentEventView = Pick<
  FulfillmentEvent,
  'type' | 'actorUserId' | 'metadata' | 'createdAt'
>;

// id is null for a PLATFORM-mode group's fulfillment order - defense in
// depth so a seller-facing client never has an id shaped like something it
// could pass to the seller-only accept/pack/cancel command endpoints, even
// though those endpoints independently reject non-seller-mode orders.
export type SellerFulfillmentOrderDetail = {
  id: string | null;
  version: number;
  fulfillmentNumber: string;
  status: FulfillmentStatus;
  awaitingAcceptance: boolean;
  acceptedAt: Date | null;
  heldReason: string | null;
  lines: SellerFulfillmentLineView[];
  events: SellerFulfillmentEventView[];
};

export type SellerShipmentLineView = {
  orderItemId: string;
  quantity: number;
};

export type SellerTrackingEventView = {
  source: TrackingEventSource;
  normalizedStatus: ShipmentStatus;
  description: string | null;
  location: string | null;
  occurredAt: Date;
  isCorrection: boolean;
};

export type SellerShipmentDetail = {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  carrierCode: string;
  methodCode: string;
  trackingReference: string | null;
  estimatedDeliveryAt: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  lines: SellerShipmentLineView[];
  trackingEvents: SellerTrackingEventView[];
};

export type SellerShippingGroupDetail = {
  id: string;
  fulfillmentMode: OfferFulfillmentMode;
  serviceLevel: string;
  methodName: string;
  items: OrderItem[];
  destination: SellerDestinationView;
  fulfillmentOrders: SellerFulfillmentOrderDetail[];
  shipments: SellerShipmentDetail[];
};

export type SellerOrderDetail = SellerOrder & {
  items: OrderItem[];
  shippingGroups: SellerShippingGroupDetail[];
  returns: SellerReturnLineView[];
};
