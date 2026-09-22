import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
import { readCurrency } from './currency-cookie';
import type {
  Category,
  Product,
  ProductListPage,
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

export async function listCategories(): Promise<Category[]> {
  const response = await apiClient.get<SuccessEnvelope<Category[]>>(
    '/catalog/categories',
    { next: { revalidate: 300 } },
  );
  return response.data;
}
