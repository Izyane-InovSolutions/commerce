import type {
  BackendCreateSellerOfferInput,
  BackendItemsPage,
  BackendSellerOffer,
  BackendSellerOfferPriceInput,
  BackendSellerOfferStatusInput,
  BackendUpdateSellerOfferInput,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * A seller's own offers — what they sell, at their price.
 *
 * Every write after creation carries the `version` the caller last read; the
 * API rejects a stale one rather than overwriting a concurrent edit, so a
 * caller passes the version through from the offer it is editing. Prices are
 * appended rather than replaced: the offer keeps its whole price history and
 * `pickCurrentPrice` resolves today's.
 */

export type BackendSellerOfferQuery = { page?: number; limit?: number };

export function backendListSellerOffers(
  client: ApiClient,
  query: BackendSellerOfferQuery = {},
): Promise<BackendItemsPage<BackendSellerOffer>> {
  return client.get('/sellers/me/offers', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetSellerOffer(
  client: ApiClient,
  id: string,
): Promise<BackendSellerOffer> {
  return client.get(`/sellers/me/offers/${id}`, { cache: 'no-store' });
}

export function backendCreateSellerOffer(
  client: ApiClient,
  input: BackendCreateSellerOfferInput,
): Promise<BackendSellerOffer> {
  return client.post('/sellers/me/offers', { body: input });
}

export function backendUpdateSellerOffer(
  client: ApiClient,
  id: string,
  input: BackendUpdateSellerOfferInput,
): Promise<BackendSellerOffer> {
  return client.patch(`/sellers/me/offers/${id}`, { body: input });
}

export function backendSetSellerOfferStatus(
  client: ApiClient,
  id: string,
  input: BackendSellerOfferStatusInput,
): Promise<BackendSellerOffer> {
  return client.patch(`/sellers/me/offers/${id}/status`, { body: input });
}

/** Appends a new price; the previous one stays in the offer's history. */
export function backendAddSellerOfferPrice(
  client: ApiClient,
  id: string,
  input: BackendSellerOfferPriceInput,
): Promise<BackendSellerOffer> {
  return client.post(`/sellers/me/offers/${id}/prices`, { body: input });
}
