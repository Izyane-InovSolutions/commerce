/**
 * Local mirror of the Commerce API's storefront shapes, beyond the catalog.
 *
 * Same rule as `catalog-types.ts`: these describe what the backend actually
 * returns, not the marketplace contract in `@commerce/contracts`. Amounts are
 * minor units throughout — `1250` is K12.50.
 */

/** A cart line names the offer it holds, never the product. */
export type CartLineView = {
  id: string;
  offerId: string;
  sellerId: string | null;
  quantity: number;
  unitPrice: { amount: number; currency: string } | null;
  lineTotal: number;
  /**
   * False once the line cannot be bought as it stands — unpublished, out of
   * stock, or not priced in the currency being browsed.
   */
  isAvailable: boolean;
  /** Every currency this line's offer currently carries a price in. */
  currencies: string[];
};

export type CartView = {
  id: string | null;
  items: CartLineView[];
  subtotal: number;
  currency: string | null;
};

/**
 * The add-item response, which is a cart plus — on the first add by a visitor
 * who is not signed in — the token that identifies the cart from then on.
 */
export type AddItemResponse = CartView & { guestToken?: string };

export type WishlistItemView = {
  id: string;
  offerId: string;
  currentPrice: { amount: number; currency: string } | null;
  isAvailable: boolean;
};

export type SavedSellerView = {
  id: string;
  sellerId: string;
  storefrontSlug: string | null;
  displayName: string | null;
  description: string | null;
  averageRating: number | null;
  ratingCount: number;
  /** False once the seller is no longer an approved, reachable storefront. */
  isAvailable: boolean;
};

/**
 * An offer as the public catalog returns it, with its price resolved.
 *
 * This is how a cart or wishlist line gets a name: the line itself carries
 * only an offer id. `listingTitle` is a seller's own title and is null for
 * the platform's own offers.
 */
export type PublicOffer = {
  id: string;
  variantId: string;
  listingTitle: string | null;
  seller: { slug: string; displayName: string | null } | null;
  isFirstParty: boolean;
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  currentPrice: { amount: number; currency: string } | null;
  currencies: string[];
  checkoutSupported: boolean;
};

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

/**
 * Warehouse progress on an order, collapsed to one value — separate from
 * `OrderStatus`, which tracks payment. Absent until fulfillment has been
 * provisioned for the order (normally once it's paid).
 */
export type FulfillmentSummary =
  | 'PREPARING'
  | 'PACKED'
  | 'PARTIALLY_DISPATCHED'
  | 'DISPATCHED'
  | 'CANCELLED';

export type OrderItem = {
  id: string;
  offerId: string;
  quantity: number;
  unitAmount: number;
  currency: string;
  lineTotal: number;
};

export type PaymentStatus =
  | 'PENDING'
  | 'REQUIRES_ACTION'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

/** What the customer is told about the payment behind their order. */
export type OrderPayment = {
  id: string;
  status: PaymentStatus;
  failureReason: string | null;
};

export type Order = {
  id: string;
  status: OrderStatus;
  payment?: OrderPayment | null;
  currency: string;
  subtotal: number;
  /** A flat, informational shipping cost — see `CheckoutQuote`. */
  shippingAmount: number;
  total: number;
  items: OrderItem[];
  createdAt: string;
  fulfillmentSummary?: FulfillmentSummary;
  /** When packing finished — null until it has. */
  packedAt?: string | null;
};

/**
 * Warehouse/carrier progress on one shipment, collapsed to what a customer is
 * safe to see — no warehouse or staff detail, mirroring the API's
 * `CustomerShipmentView`.
 */
export type ShipmentStatus =
  | 'PENDING_BOOKING'
  | 'BOOKED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'EXCEPTION'
  | 'RETURN_TO_SENDER'
  | 'RETURNED'
  | 'CANCELLED';

export type ShipmentTrackingEvent = {
  normalizedStatus: ShipmentStatus;
  description: string | null;
  location: string | null;
  occurredAt: string;
};

/** One shipment against an order — an order with split fulfillment can have
 * more than one, each tracked separately from confirmation to delivery. */
export type OrderShipment = {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  methodName: string;
  trackingReference: string | null;
  estimatedDeliveryAt: string | null;
  createdAt: string;
  events: ShipmentTrackingEvent[];
};

export type Address = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export type CheckoutResult = {
  order: Order;
  payment: { id: string; status: string; redirectUrl?: string };
};

/**
 * The cost breakdown a checkout would charge right now, without creating an
 * order — what lets the checkout page show shipping before the shopper pays.
 * `total` is exactly what `Order.total` will read once the order exists.
 */
export type CheckoutQuote = {
  currency: string;
  subtotal: number;
  shippingAmount: number;
  total: number;
};
