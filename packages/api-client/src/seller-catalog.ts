import type {
  Paginated,
  SellerCatalogQuery,
  SellerProductRow,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from './client.ts';

/**
 * A seller's own view of what they sell: one row per SKU, with their price and
 * their stock joined in.
 *
 * Scoped to the caller's seller account by the API, so there is no seller
 * parameter to get wrong.
 */
export function listSellerCatalog(
  client: ApiClient,
  query: Partial<SellerCatalogQuery> = {},
): Promise<Paginated<SellerProductRow>> {
  return client.get('/seller/catalog', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}
