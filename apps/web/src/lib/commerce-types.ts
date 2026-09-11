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
  /** False once the offer stops being sellable — unpublished, or out of stock. */
  isAvailable: boolean;
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
  currentPrice: { amount: number; currency: string };
  checkoutSupported: boolean;
};

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type OrderItem = {
  id: string;
  offerId: string;
  quantity: number;
  unitAmount: number;
  currency: string;
  lineTotal: number;
};

export type Order = {
  id: string;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  total: number;
  items: OrderItem[];
  createdAt: string;
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
