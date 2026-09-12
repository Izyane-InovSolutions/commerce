import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
import { listProducts } from './catalog';
import { getPrimaryImage } from './catalog-types';
import type { SuccessEnvelope } from './catalog-types';
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

export async function getCart(): Promise<CartView> {
  const response = await apiClient.get<SuccessEnvelope<CartView>>('/cart', {
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
    { body: { quantity }, headers: await guestHeaders() },
  );
  return response.data;
}

export async function removeCartItem(itemId: string): Promise<CartView> {
  const response = await apiClient.delete<SuccessEnvelope<CartView>>(
    `/cart/items/${itemId}`,
    { headers: await guestHeaders() },
  );
  return response.data;
}

/**
 * Folds a guest cart into the signed-in visitor's own, after they sign in.
 *
 * Merging is the one cart call that requires a real account, so a failure
 * here is not worth failing a sign-in over: the guest cart is left alone and
 * the visitor still lands signed in.
 */
export async function mergeGuestCart(): Promise<void> {
  const token = await readGuestToken();
  if (!token) {
    return;
  }

  try {
    await apiClient.post('/cart/merge', {
      headers: { [GUEST_TOKEN_HEADER]: token },
    });
  } catch {
    // Nothing to do: the visitor keeps whatever their own cart already held.
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
};

const UNKNOWN_OFFER: OfferLabel = {
  name: 'Item no longer listed',
  slug: null,
  imageUrl: null,
};

/** One page of the catalog is enough to name what a cart usually holds. */
const CATALOG_INDEX_LIMIT = 100;

async function readPublicOffer(offerId: string): Promise<PublicOffer | null> {
  try {
    const response = await apiClient.get<SuccessEnvelope<PublicOffer>>(
      `/catalog/offers/${offerId}`,
      { next: { revalidate: 60 } },
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
 * Names cart, wishlist, and order lines.
 *
 * Every one of them carries an offer id and nothing else, and the offer only
 * carries `listingTitle` — which a seller sets and the platform's own offers
 * leave null. So for a first-party offer the name has to come from the
 * catalog, indexed by variant, since the API exposes no way to go from an
 * offer or variant back to its product directly.
 *
 * That index is one page deep: a line pointing at a product beyond the first
 * hundred falls back to a generic label rather than costing a second round of
 * requests. Widening it means paging the catalog, or an endpoint that returns
 * a product for a variant.
 */
export async function labelOffers(
  offerIds: string[],
): Promise<Map<string, OfferLabel>> {
  const unique = [...new Set(offerIds)];
  if (unique.length === 0) {
    return new Map();
  }

  const offers = await Promise.all(unique.map(readPublicOffer));

  // Worth the read whenever a line resolved at all: it is where both the
  // first-party names and every thumbnail come from.
  const byVariant = offers.some((offer) => offer !== null)
    ? await indexCatalogByVariant()
    : new Map<string, OfferLabel>();

  return new Map(
    unique.map((offerId, index) => {
      const offer = offers[index];
      if (!offer) {
        return [offerId, UNKNOWN_OFFER];
      }

      const fromCatalog = byVariant.get(offer.variantId);
      return [
        offerId,
        {
          name: offer.listingTitle ?? fromCatalog?.name ?? 'Catalog item',
          slug: fromCatalog?.slug ?? null,
          imageUrl: fromCatalog?.imageUrl ?? null,
        },
      ];
    }),
  );
}

async function indexCatalogByVariant(): Promise<Map<string, OfferLabel>> {
  const index = new Map<string, OfferLabel>();

  try {
    const { products } = await listProducts({ limit: CATALOG_INDEX_LIMIT });
    for (const product of products) {
      const image = getPrimaryImage(product);
      for (const variant of product.variants) {
        index.set(variant.id, {
          name: product.name,
          slug: product.slug,
          imageUrl: image?.url ?? null,
        });
      }
    }
  } catch {
    // Names are a convenience; a failure here costs labels, not the page.
  }

  return index;
}
