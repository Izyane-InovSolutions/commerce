export type CartIdentity = {
  userId?: string;
  guestToken?: string;
};

export type CartLineView = {
  id: string;
  offerId: string;
  sellerId: string | null;
  quantity: number;
  unitPrice: { amount: number; currency: string } | null;
  lineTotal: number;
  isAvailable: boolean;
  /** Every currency this line's offer currently carries a price in. */
  currencies: string[];
};

// Assumes a single currency across the cart's available lines, matching the
// scope of this ticket — multi-currency carts aren't in the plan.
export type CartView = {
  id: string | null;
  items: CartLineView[];
  subtotal: number;
  currency: string | null;
};

export type AddItemResult = {
  view: CartView;
  guestToken?: string;
};

export type AddItemResponse = CartView & { guestToken?: string };

/**
 * One persisted cart line as a checkout consumed it. The order keeps these as
 * its cleanup receipt, so only lines still exactly in this state are removed.
 */
export type CheckoutCartSnapshotLine = {
  id: string;
  offerId: string;
  quantity: number;
  revision: number;
};

/**
 * A snapshot line as read from the cart, with the line's `createdAt`: cart
 * lines are allocated stock in (createdAt, id) order, both by the cart's own
 * stock check and by checkout's reservations. `createdAt` only orders the
 * reservations; it is not part of the receipt the order persists.
 */
export type CheckoutCartSnapshotRow = CheckoutCartSnapshotLine & {
  createdAt: Date;
};
