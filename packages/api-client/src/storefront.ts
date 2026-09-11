import type {
  Paginated,
  StorefrontListQuery,
  StorefrontProduct,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from './client.ts';

/**
 * Public storefront endpoints.
 *
 * These need no session. The API decides what is on sale — an active product
 * with at least one active offer from an approved seller — so a client never
 * filters for visibility itself.
 */

export function listStorefrontProducts(
  client: ApiClient,
  query: Partial<StorefrontListQuery> = {},
): Promise<Paginated<StorefrontProduct>> {
  return client.get('/storefront/products', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function getStorefrontProduct(
  client: ApiClient,
  slug: string,
): Promise<StorefrontProduct> {
  return client.get(`/storefront/products/${slug}`, { cache: 'no-store' });
}
