import type {
  CreateOfferInput,
  Offer,
  OfferListQuery,
  Paginated,
  UpdateOfferInput,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from './client';

/** Offer endpoints. A seller owns offers against catalog SKUs, never products. */

export function listOffers(
  client: ApiClient,
  query: Partial<OfferListQuery> = {},
): Promise<Paginated<Offer>> {
  return client.get('/offers', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function getOffer(client: ApiClient, id: string): Promise<Offer> {
  return client.get(`/offers/${id}`, { cache: 'no-store' });
}

/**
 * Creates an offer.
 *
 * The seller comes from the caller's session, so a seller cannot list stock
 * under someone else's account. `sellerId` is only for an admin acting on a
 * seller's behalf, and the API rejects it from anyone else.
 */
export function createOffer(
  client: ApiClient,
  input: CreateOfferInput,
  sellerId?: string,
): Promise<Offer> {
  return client.post('/offers', {
    query: sellerId === undefined ? undefined : { sellerId },
    body: input,
  });
}

export function updateOffer(
  client: ApiClient,
  id: string,
  input: UpdateOfferInput,
): Promise<Offer> {
  return client.patch(`/offers/${id}`, { body: input });
}
