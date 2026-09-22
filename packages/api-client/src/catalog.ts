import type {
  Brand,
  Category,
  CreateBrandInput,
  CreateCategoryInput,
  CreateProductInput,
  ResolveProposalInput,
  UpdateBrandInput,
  UpdateCategoryInput,
  SubmitProductInput,
  UpdateSellerProductInput,
  Paginated,
  Product,
  ProductListQuery,
  SkuListQuery,
  SkuSummary,
  UpdateProductInput,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from './client';

/** Catalog endpoints. Products are platform-owned; sellers reach them via offers. */

function toQuery(
  query: Partial<Record<string, QueryValue>> = {},
): Record<string, QueryValue> {
  return query as Record<string, QueryValue>;
}

export function listProducts(
  client: ApiClient,
  query: Partial<ProductListQuery> = {},
): Promise<Paginated<Product>> {
  return client.get('/products', { query: toQuery(query), cache: 'no-store' });
}

export function getProduct(client: ApiClient, id: string): Promise<Product> {
  return client.get(`/products/${id}`, { cache: 'no-store' });
}

export function createProduct(
  client: ApiClient,
  input: CreateProductInput,
): Promise<Product> {
  return client.post('/products', { body: input });
}

export function updateProduct(
  client: ApiClient,
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  return client.patch(`/products/${id}`, { body: input });
}

export function listCategories(client: ApiClient): Promise<Category[]> {
  return client.get('/categories', { cache: 'no-store' });
}

export function listBrands(client: ApiClient): Promise<Brand[]> {
  return client.get('/brands', { cache: 'no-store' });
}

export function listSkus(
  client: ApiClient,
  query: Partial<SkuListQuery> = {},
): Promise<Paginated<SkuSummary>> {
  return client.get('/skus', { query: toQuery(query), cache: 'no-store' });
}

/**
 * Submits a product for the catalog as a seller.
 *
 * It lands as `pending` and is invisible to shoppers until an admin approves
 * it — the product stays platform-owned; the seller owns the offer.
 */
export function submitProduct(
  client: ApiClient,
  input: SubmitProductInput,
): Promise<Product> {
  return client.post('/seller/products', { body: input });
}

export function approveProduct(
  client: ApiClient,
  productId: string,
): Promise<Product> {
  return client.post(`/products/${productId}/approve`);
}

export function rejectProduct(
  client: ApiClient,
  productId: string,
  reason: string,
): Promise<Product> {
  return client.post(`/products/${productId}/reject`, { body: { reason } });
}

/**
 * Edits a seller's own submission.
 *
 * Allowed while the product is a draft, awaiting review, or rejected. Editing
 * a rejected product returns it to the review queue, which is how a seller
 * answers the feedback.
 */
export function updateSellerProduct(
  client: ApiClient,
  productId: string,
  input: UpdateSellerProductInput,
): Promise<Product> {
  return client.patch(`/seller/products/${productId}`, { body: input });
}

/** Sends a draft for review. */
export function submitDraftProduct(
  client: ApiClient,
  productId: string,
): Promise<Product> {
  return client.post(`/seller/products/${productId}/submit`);
}

/**
 * Categories and brands are administrative.
 *
 * The taxonomy is shared by every seller, so it is curated centrally rather
 * than extended by whoever happens to be listing a product.
 */

export function createCategory(
  client: ApiClient,
  input: CreateCategoryInput,
): Promise<Category> {
  return client.post('/categories', { body: input });
}

export function updateCategory(
  client: ApiClient,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  return client.patch(`/categories/${categoryId}`, { body: input });
}

/** Refused while sub-categories or products still reference it. */
export function deleteCategory(
  client: ApiClient,
  categoryId: string,
): Promise<null> {
  return client.delete(`/categories/${categoryId}`);
}

export function createBrand(
  client: ApiClient,
  input: CreateBrandInput,
): Promise<Brand> {
  return client.post('/brands', { body: input });
}

export function updateBrand(
  client: ApiClient,
  brandId: string,
  input: UpdateBrandInput,
): Promise<Brand> {
  return client.patch(`/brands/${brandId}`, { body: input });
}

/** Refused while products still carry it. */
export function deleteBrand(client: ApiClient, brandId: string): Promise<null> {
  return client.delete(`/brands/${brandId}`);
}

/**
 * Settles a brand or category a seller proposed on their submission.
 *
 * Part of reviewing the product, not a queue of its own — a proposal only
 * means anything in the context of what it is for.
 */
export function resolveProductBrand(
  client: ApiClient,
  productId: string,
  input: ResolveProposalInput,
): Promise<Product> {
  return client.post(`/products/${productId}/brand`, { body: input });
}

export function resolveProductCategory(
  client: ApiClient,
  productId: string,
  input: ResolveProposalInput,
): Promise<Product> {
  return client.post(`/products/${productId}/category`, { body: input });
}
