import { apiClient } from './api';
import type { SuccessEnvelope } from './catalog-types';
import type { SavedSellerView } from './commerce-types';

/**
 * Saved sellers, like the wishlist, has no guest form: every call requires a
 * signed-in account.
 */

export async function listSavedSellers(): Promise<SavedSellerView[]> {
  const response = await apiClient.get<SuccessEnvelope<SavedSellerView[]>>(
    '/saved-sellers',
    { cache: 'no-store' },
  );
  return response.data;
}

/** Saving twice is not an error; the API answers 204 either way. */
export async function saveSeller(sellerId: string): Promise<void> {
  await apiClient.post('/saved-sellers', { body: { sellerId } });
}

export async function unsaveSeller(sellerId: string): Promise<void> {
  await apiClient.delete(`/saved-sellers/${sellerId}`);
}
