import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
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
 * Puts names and prices on cart lines.
 *
 * A line carries an offer id and nothing else, so each one is read back from
 * the public offer endpoint. A line whose offer cannot be read still renders
 * — it just shows the quantity and what was charged for it.
 */
export async function describeOffers(
  offerIds: string[],
): Promise<Map<string, PublicOffer>> {
  const unique = [...new Set(offerIds)];

  const offers = await Promise.all(
    unique.map(async (offerId) => {
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
    }),
  );

  return new Map(
    offers
      .filter((offer): offer is PublicOffer => offer !== null)
      .map((offer) => [offer.id, offer]),
  );
}
