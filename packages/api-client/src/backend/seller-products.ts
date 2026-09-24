import type {
  BackendAttachProductMediaInput,
  BackendCreateProductInput,
  BackendCreateVariantInput,
  BackendProductSubmission,
  BackendVariant,
} from '@commerce/contracts';

import type { ApiClient } from '../client.ts';

/**
 * A seller's own brand-new catalog products — submitted for admin review,
 * distinct from `seller-offers.ts`, which lists against a product the
 * platform already published.
 */

export function backendListSellerProducts(
  client: ApiClient,
): Promise<BackendProductSubmission[]> {
  return client.get('/sellers/me/products', { cache: 'no-store' });
}

export function backendGetSellerProduct(
  client: ApiClient,
  id: string,
): Promise<BackendProductSubmission> {
  return client.get(`/sellers/me/products/${id}`, { cache: 'no-store' });
}

export function backendSubmitProduct(
  client: ApiClient,
  input: BackendCreateProductInput,
): Promise<BackendProductSubmission> {
  return client.post('/sellers/me/products', { body: input });
}

export function backendAddSellerProductVariant(
  client: ApiClient,
  productId: string,
  input: BackendCreateVariantInput,
): Promise<BackendVariant> {
  return client.post(`/sellers/me/products/${productId}/variants`, {
    body: input,
  });
}

export function backendAttachSellerProductMedia(
  client: ApiClient,
  productId: string,
  input: BackendAttachProductMediaInput,
): Promise<BackendProductSubmission> {
  return client.post(`/sellers/me/products/${productId}/media`, {
    body: input,
  });
}
