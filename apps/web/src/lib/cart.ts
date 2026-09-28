import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
import type { SuccessEnvelope } from './catalog-types';
import { readCurrency } from './currency-cookie';
import type { AddItemResponse, CartView, PublicOffer } from './commerce-types';
import {
  GUEST_TOKEN_HEADER,
  readGuestToken,
  writeGuestToken,
} from './guest-cookie';

/**
 * The cart lives on the server.
 *
 * Who it belongs to is decided by what the request carries: a signed-in
 * visitor is identified by their bearer token, and everyone else by a guest
 * token the API mints on their first add and this app keeps in a cookie. That
 * is why every call here passes the guest header — for a signed-in visitor the
 * API ignores it, and for a guest it is the whole identity of the cart.
 */
async function guestHeaders(): Promise<Record<string, string>> {
  const token = await readGuestToken();
  return token ? { [GUEST_TOKEN_HEADER]: token } : {};
}

/**
 * Every cart call names the currency it wants the cart priced in.
 *
 * The cart itself stores only offers and quantities — the money is resolved
 * per request — so the shopper switching currency re-prices what they already
 * have rather than needing a new cart.
 */
async function currencyQuery(): Promise<{ currency: string }> {
  return { currency: await readCurrency() };
}

export async function getCart(): Promise<CartView> {
  const response = await apiClient.get<SuccessEnvelope<CartView>>('/cart', {
    query: await currencyQuery(),
    headers: await guestHeaders(),
    cache: 'no-store',
  });
  return response.data;
}

/**
 * Adds an offer to the cart, and remembers a guest cart's token.
 *
 * Only the first add by an anonymous visitor returns a token; storing it here
 * means every later request finds the same cart. Cookies can only be written
 * from a server action, so this must be called from one.
 */
export async function addToCart(
  offerId: string,
  quantity = 1,
): Promise<CartView> {
  const response = await apiClient.post<SuccessEnvelope<AddItemResponse>>(
    '/cart/items',
    {
      body: { offerId, quantity },
      query: await currencyQuery(),
      headers: await guestHeaders(),
    },
  );

  const { guestToken, ...cart } = response.data;
  if (guestToken) {
    await writeGuestToken(guestToken);
  }

  return cart;
}

export async function updateCartItem(
  itemId: string,
  quantity: number,
): Promise<CartView> {
  const response = await apiClient.patch<SuccessEnvelope<CartView>>(
    `/cart/items/${itemId}`,
    {
      body: { quantity },
      query: await currencyQuery(),
      headers: await guestHeaders(),
    },
  );
  return response.data;
}

export async function removeCartItem(itemId: string): Promise<CartView> {
  const response = await apiClient.delete<SuccessEnvelope<CartView>>(
    `/cart/items/${itemId}`,
    { query: await currencyQuery(), headers: await guestHeaders() },
  );
  return response.data;
}

/** How folding a guest cart into an account went — `none` when there was
 * no guest cart to fold. */
export type CartMergeOutcome = 'merged' | 'none' | 'failed';

/**
 * Folds a guest cart into the signed-in visitor's own, after they sign in.
 *
 * Merging is the one cart call that requires a real account, so a failure
 * here is not worth failing a sign-in over: the guest cart is left alone and
 * the visitor still lands signed in. The outcome is returned rather than
 * swallowed so the caller can tell them, and offer to try again.
 */
export async function mergeGuestCart(): Promise<CartMergeOutcome> {
  const token = await readGuestToken();
  if (!token) {
    return 'none';
  }

  try {
    await apiClient.post('/cart/merge', {
      query: await currencyQuery(),
      headers: { [GUEST_TOKEN_HEADER]: token },
    });
    return 'merged';
  } catch {
    // The visitor keeps whatever their own cart already held; the guest
    // cart is still there to retry with.
    return 'failed';
  }
}

/**
 * A name for something the API only identified by offer id.
 *
 * The slug comes with it where it is known, so a cart or order line can link
 * back to the product it came from.
 */
export type OfferLabel = {
  name: string;
  slug: string | null;
  imageUrl: string | null;
  /** The storefront behind the offer; null for the platform's own. */
  sellerName?: string | null;
};

export const UNKNOWN_OFFER: OfferLabel = {
  name: 'Item no longer listed',
  slug: null,
  imageUrl: null,
  sellerName: null,
};

async function readPublicOffer(
  offerId: string,
  currency: string,
): Promise<PublicOffer | null> {
  try {
    const response = await apiClient.get<SuccessEnvelope<PublicOffer>>(
      `/catalog/offers/${offerId}`,
      { query: { currency }, next: { revalidate: 60 } },
    );
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) {
      return null;
    }
    throw error;
  }
}

/**
 * The label for one resolved offer.
 *
 * A seller's own `listingTitle` wins, since it is what they sell the item
 * as; otherwise the platform product's name, which the by-id offer lookup
 * carries alongside the offer. An offer the API no longer serves publicly
 * (unpublished, or its seller suspended) comes back null and is labelled as
 * such rather than guessed at.
 */
export function labelFromOffer(offer: PublicOffer | null): OfferLabel {
  if (!offer) {
    return UNKNOWN_OFFER;
  }

  return {
    name: offer.listingTitle ?? offer.product?.name ?? 'Catalog item',
    slug: offer.product?.slug ?? null,
    imageUrl: offer.product?.image?.url ?? null,
    sellerName: offer.seller?.displayName ?? null,
  };
}

/**
 * Names cart, wishlist, and order lines.
 *
 * Every one of them carries an offer id and nothing else, so each distinct
 * offer is looked up once — which is also what names a first-party line,
 * whose offer has no `listingTitle` of its own: the lookup returns the
 * product it lists against. One request per distinct offer, all in parallel,
 * and cached briefly, since a cart is only ever a handful of them.
 */
export async function labelOffers(
  offerIds: string[],
): Promise<Map<string, OfferLabel>> {
  const unique = [...new Set(offerIds)];
  if (unique.length === 0) {
    return new Map();
  }

  const currency = await readCurrency();
  const offers = await Promise.all(
    unique.map((offerId) => readPublicOffer(offerId, currency)),
  );

  return new Map(
    unique.map((offerId, index) => [
      offerId,
      labelFromOffer(offers[index] ?? null),
    ]),
  );
}
