import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
import { readCurrency } from './currency-cookie';
import type {
  Brand,
  Category,
  NestedPage,
  Product,
  ProductListPage,
  ProductReview,
  ReviewSort,
  SellerRating,
  Storefront,
  StorefrontOfferPage,
  SuccessEnvelope,
} from './catalog-types';

export type ProductListQuery = {
  categorySlug?: string;
  brandSlug?: string;
  /** Matches a product with a variant carrying any of these values. */
  attributeValueIds?: string[];
  /** Free-text search, as the API names it. */
  q?: string;
  /** `field:asc|desc`; the API only sorts on `name` and `createdAt`. */
  sort?: string;
  /** Only admin-featured products, most recently featured first. */
  featured?: boolean;
  page?: number;
  limit?: number;
};

export type ProductListResult = {
  products: Product[];
  total: number;
  page: number;
  limit: number;
};

/**
 * `?attributeValueId=a&attributeValueId=b` — the API reads a repeated key
 * as a list, but the client's `query` option only holds one value per key,
 * so a list goes in the path's own query string instead (which the client
 * keeps, adding its `query` entries after it).
 */
function withRepeatedParam(path: string, key: string, values: string[]) {
  if (values.length === 0) return path;
  const search = new URLSearchParams();
  for (const value of values) search.append(key, value);
  return `${path}?${search.toString()}`;
}

export async function listProducts(
  query: ProductListQuery = {},
): Promise<ProductListResult> {
  // The currency goes in the query string, not a header, so the cached
  // response varies by it — two shoppers browsing in different currencies
  // must not share one cached page.
  const response = await apiClient.get<SuccessEnvelope<ProductListPage>>(
    withRepeatedParam(
      '/catalog/products',
      'attributeValueId',
      query.attributeValueIds ?? [],
    ),
    {
      query: {
        categorySlug: query.categorySlug,
        brandSlug: query.brandSlug,
        q: query.q,
        sort: query.sort,
        featured: query.featured ? 'true' : undefined,
        page: query.page,
        limit: query.limit,
        currency: await readCurrency(),
      },
      next: { revalidate: 60 },
    },
  );

  return {
    products: response.data.data,
    total: response.data.meta.total,
    page: response.data.meta.page,
    limit: response.data.meta.limit,
  };
}

/**
 * The most-ordered products over the last `days` days —
 * `GET /catalog/best-sellers`, each item shaped exactly like a product-list
 * item. Empty rather than an error while the API doesn't serve the route
 * yet (404), so the pages built on it degrade to their empty state.
 */
export async function listBestSellers(
  query: { limit?: number; days?: number } = {},
): Promise<Product[]> {
  try {
    const response = await apiClient.get<SuccessEnvelope<{ items: Product[] }>>(
      '/catalog/best-sellers',
      {
        query: {
          limit: query.limit,
          days: query.days,
          currency: await readCurrency(),
        },
        next: { revalidate: 300 },
      },
    );
    return response.data.items;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * Products on sale now — `GET /catalog/deals`, biggest saving first. Empty
 * while the API doesn't serve the route yet, so the deals shelf just hides.
 */
export async function listDeals(limit = 12): Promise<Product[]> {
  try {
    const response = await apiClient.get<SuccessEnvelope<{ items: Product[] }>>(
      '/catalog/deals',
      {
        query: { limit, currency: await readCurrency() },
        next: { revalidate: 120 },
      },
    );
    return response.data.items;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * Admin-featured products. An API older than the `featured` filter rejects
 * the unknown parameter (400), which reads as "nothing featured" too.
 */
export async function listFeatured(limit = 10): Promise<Product[]> {
  try {
    return (await listProducts({ featured: true, limit })).products;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 404)
    ) {
      return [];
    }
    throw error;
  }
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

/**
 * Every published offer of one variant — the product page's "Other sellers"
 * comparison. Only offers priced in the browsing currency are included (the
 * API narrows on it), paged flat like the storefront offers.
 */
export async function listVariantOffers(
  variantId: string,
  query: { page?: number; limit?: number } = {},
): Promise<StorefrontOfferPage> {
  const response = await apiClient.get<SuccessEnvelope<StorefrontOfferPage>>(
    `/catalog/variants/${encodeURIComponent(variantId)}/offers`,
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

/** Shared by product reviews and seller ratings — the API reads both with
 * the same query DTO. `rating` is an exact star value, not a minimum. */
export type ReviewListQuery = {
  page?: number;
  limit?: number;
  sort?: ReviewSort;
  rating?: number;
};

/** A product's published reviews, newest first unless `sort` says
 * otherwise. The star breakdown isn't here: it's on the product itself. */
export async function listProductReviews(
  slug: string,
  query: ReviewListQuery = {},
): Promise<NestedPage<ProductReview>> {
  const response = await apiClient.get<
    SuccessEnvelope<NestedPage<ProductReview>>
  >(`/catalog/products/${encodeURIComponent(slug)}/reviews`, {
    query: {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      rating: query.rating,
    },
    next: { revalidate: 60 },
  });
  return response.data;
}

/** A seller's published ratings — the breakdown is on the storefront. */
export async function listStorefrontRatings(
  slug: string,
  query: ReviewListQuery = {},
): Promise<NestedPage<SellerRating>> {
  const response = await apiClient.get<
    SuccessEnvelope<NestedPage<SellerRating>>
  >(`/storefronts/${encodeURIComponent(slug)}/ratings`, {
    query: {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      rating: query.rating,
    },
    next: { revalidate: 60 },
  });
  return response.data;
}

export async function listBrands(): Promise<Brand[]> {
  const response = await apiClient.get<SuccessEnvelope<Brand[]>>(
    '/catalog/brands',
    { next: { revalidate: 300 } },
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
