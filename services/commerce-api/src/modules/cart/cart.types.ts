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
