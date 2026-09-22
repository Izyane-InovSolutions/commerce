import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
import { readCurrency } from './currency-cookie';
import type {
  Category,
  Product,
  ProductListPage,
  Storefront,
  StorefrontOfferPage,
  SuccessEnvelope,
} from './catalog-types';

export type ProductListQuery = {
  categorySlug?: string;
  /** Free-text search, as the API names it. */
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
};

export async function listProducts(
  query: ProductListQuery = {},
): Promise<{ products: Product[]; total: number }> {
  // The currency goes in the query string, not a header, so the cached
  // response varies by it — two shoppers browsing in different currencies
  // must not share one cached page.
  const response = await apiClient.get<SuccessEnvelope<ProductListPage>>(
    '/catalog/products',
    {
      query: {
        categorySlug: query.categorySlug,
        q: query.q,
        sort: query.sort,
        page: query.page,
        limit: query.limit,
        currency: await readCurrency(),
      },
      next: { revalidate: 60 },
    },
  );

  return { products: response.data.data, total: response.data.meta.total };
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    const response = await apiClient.get<SuccessEnvelope<Product>>(
      `/catalog/products/${encodeURIComponent(slug)}`,
      { query: { currency: await readCurrency() }, next: { revalidate: 60 } },
    );
    return response.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** The seller's own public page, or null if the slug matches nothing a
 * shopper could actually buy from (unknown, unapproved, or suspended). */
export async function getStorefront(slug: string): Promise<Storefront | null> {
  try {
    const response = await apiClient.get<SuccessEnvelope<Storefront>>(
      `/storefronts/${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } },
    );
    return response.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export type StorefrontOfferQuery = { page?: number; limit?: number };

/** Every listing this seller currently has published, at the price they've
 * set — never another seller's offer of the same underlying product. */
export async function listStorefrontOffers(
  slug: string,
  query: StorefrontOfferQuery = {},
): Promise<StorefrontOfferPage> {
  const response = await apiClient.get<SuccessEnvelope<StorefrontOfferPage>>(
    `/storefronts/${encodeURIComponent(slug)}/offers`,
    {
      query: {
        page: query.page,
        limit: query.limit,
        currency: await readCurrency(),
      },
      next: { revalidate: 60 },
    },
  );
  return response.data;
}

export async function listCategories(): Promise<Category[]> {
  const response = await apiClient.get<SuccessEnvelope<Category[]>>(
    '/catalog/categories',
    { next: { revalidate: 300 } },
  );
  return response.data;
}
