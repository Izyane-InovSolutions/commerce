import type {
  BackendBrand,
  BackendCategory,
  BackendCreateBrandInput,
  BackendCreateCategoryInput,
  BackendCreatePriceInput,
  BackendCreateProductInput,
  BackendCreateVariantInput,
  BackendAdminOffer,
  BackendAdminProduct,
  BackendPage,
  BackendProduct,
  BackendProductStatus,
  BackendVariant,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Catalog endpoints.
 *
 * The admin listings are the authoritative ones — they include drafts. The
 * public reads are here too because the admin product read is currently
 * unusable whenever a product has media attached.
 */

export function backendListCategories(
  client: ApiClient,
): Promise<BackendCategory[]> {
  return client.get('/admin/catalog/categories', { cache: 'no-store' });
}

export function backendCreateCategory(
  client: ApiClient,
  input: BackendCreateCategoryInput,
): Promise<BackendCategory> {
  return client.post('/admin/catalog/categories', { body: input });
}

export function backendUpdateCategory(
  client: ApiClient,
  id: string,
  input: Partial<BackendCreateCategoryInput>,
): Promise<BackendCategory> {
  return client.patch(`/admin/catalog/categories/${id}`, { body: input });
}

export function backendDeleteCategory(
  client: ApiClient,
  id: string,
): Promise<null> {
  return client.delete(`/admin/catalog/categories/${id}`);
}

export function backendListBrands(client: ApiClient): Promise<BackendBrand[]> {
  return client.get('/admin/catalog/brands', { cache: 'no-store' });
}

export function backendCreateBrand(
  client: ApiClient,
  input: BackendCreateBrandInput,
): Promise<BackendBrand> {
  return client.post('/admin/catalog/brands', { body: input });
}

export function backendUpdateBrand(
  client: ApiClient,
  id: string,
  input: Partial<BackendCreateBrandInput>,
): Promise<BackendBrand> {
  return client.patch(`/admin/catalog/brands/${id}`, { body: input });
}

export function backendDeleteBrand(
  client: ApiClient,
  id: string,
): Promise<null> {
  return client.delete(`/admin/catalog/brands/${id}`);
}

/**
 * Query for the *public* listing. The search term is `q` and there is no
 * status filter — that listing is published products only by definition.
 */
export type BackendProductQuery = {
  page?: number;
  limit?: number;
  q?: string;
  categorySlug?: string;
  brandSlug?: string;
};

/**
 * Admin listing: includes drafts and archived products.
 *
 * Returns the whole catalog as a bare array — this endpoint takes no paging or
 * filter parameters, so a caller that needs either does it after the fact.
 */
export function backendListProducts(
  client: ApiClient,
): Promise<BackendAdminProduct[]> {
  return client.get('/admin/catalog/products', { cache: 'no-store' });
}

export function backendGetProduct(
  client: ApiClient,
  id: string,
): Promise<BackendAdminProduct> {
  return client.get(`/admin/catalog/products/${id}`, { cache: 'no-store' });
}

/** Public listing: published products only, and immune to the media defect. */
export function backendListPublicProducts(
  client: ApiClient,
  query: BackendProductQuery = {},
): Promise<BackendPage<BackendProduct>> {
  return client.get('/catalog/products', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetPublicProduct(
  client: ApiClient,
  slug: string,
): Promise<BackendProduct> {
  return client.get(`/catalog/products/${slug}`, { cache: 'no-store' });
}

export function backendCreateProduct(
  client: ApiClient,
  input: BackendCreateProductInput,
): Promise<BackendAdminProduct> {
  return client.post('/admin/catalog/products', { body: input });
}

export function backendUpdateProduct(
  client: ApiClient,
  id: string,
  input: Partial<BackendCreateProductInput>,
): Promise<BackendAdminProduct> {
  return client.patch(`/admin/catalog/products/${id}`, { body: input });
}

export function backendSetProductStatus(
  client: ApiClient,
  id: string,
  status: BackendProductStatus,
): Promise<BackendAdminProduct> {
  return client.patch(`/admin/catalog/products/${id}/status`, {
    body: { status },
  });
}

export function backendAddVariant(
  client: ApiClient,
  productId: string,
  input: BackendCreateVariantInput,
): Promise<BackendVariant> {
  return client.post(`/admin/catalog/products/${productId}/variants`, {
    body: input,
  });
}

export function backendSetVariantStatus(
  client: ApiClient,
  productId: string,
  variantId: string,
  status: BackendProductStatus,
): Promise<BackendVariant> {
  return client.patch(
    `/admin/catalog/products/${productId}/variants/${variantId}/status`,
    { body: { status } },
  );
}

/** An offer carries no price of its own; a price is added to it afterwards. */
export function backendCreateOffer(
  client: ApiClient,
  variantId: string,
): Promise<BackendAdminOffer> {
  return client.post('/admin/catalog/offers', { body: { variantId } });
}

export function backendAddPrice(
  client: ApiClient,
  offerId: string,
  input: BackendCreatePriceInput,
): Promise<BackendAdminOffer> {
  return client.post(`/admin/catalog/offers/${offerId}/prices`, {
    body: input,
  });
}

export function backendSetOfferStatus(
  client: ApiClient,
  offerId: string,
  status: BackendProductStatus,
): Promise<BackendAdminOffer> {
  return client.patch(`/admin/catalog/offers/${offerId}/status`, {
    body: { status },
  });
}
