import { apiClient } from './api';
import type { SuccessEnvelope } from './catalog-types';
import type { WishlistItemView } from './commerce-types';

/**
 * The wishlist, unlike the cart, has no guest form: every call requires a
 * signed-in account, so a visitor who is not signed in is asked to sign in
 * rather than shown an empty list.
 */

export async function listWishlist(): Promise<WishlistItemView[]> {
  const response = await apiClient.get<SuccessEnvelope<WishlistItemView[]>>(
    '/wishlist',
    { cache: 'no-store' },
  );
  return response.data;
}

/** Adding twice is not an error; the API answers 204 either way. */
export async function addToWishlist(offerId: string): Promise<void> {
  await apiClient.post('/wishlist', { body: { offerId } });
}

export async function removeFromWishlist(offerId: string): Promise<void> {
  await apiClient.delete(`/wishlist/${offerId}`);
}
