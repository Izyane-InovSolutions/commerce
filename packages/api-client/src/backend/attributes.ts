import type {
  BackendAttribute,
  BackendAttributeValue,
  BackendAttributeValueInput,
  BackendAttributeWithValues,
  BackendCategoryAttribute,
  BackendCreateAttributeInput,
  BackendSetCategoryAttributesInput,
  BackendUpdateAttributeInput,
} from '@commerce/contracts';

import type { ApiClient } from '../client.ts';

/**
 * Catalog attributes and their values.
 *
 * The reads carry every value; the writes hand back just the row written, so
 * a caller that wants the full picture reads the list again. Deleting an
 * attribute takes its values with it, and deleting a value takes it off every
 * variant that carried it — the API does not refuse either.
 */

export function backendListAttributes(
  client: ApiClient,
): Promise<BackendAttributeWithValues[]> {
  return client.get('/admin/catalog/attributes', { cache: 'no-store' });
}

export function backendGetAttribute(
  client: ApiClient,
  id: string,
): Promise<BackendAttributeWithValues> {
  return client.get(`/admin/catalog/attributes/${id}`, { cache: 'no-store' });
}

export function backendCreateAttribute(
  client: ApiClient,
  input: BackendCreateAttributeInput,
): Promise<BackendAttribute> {
  return client.post('/admin/catalog/attributes', { body: input });
}

export function backendUpdateAttribute(
  client: ApiClient,
  id: string,
  input: BackendUpdateAttributeInput,
): Promise<BackendAttribute> {
  return client.patch(`/admin/catalog/attributes/${id}`, { body: input });
}

export function backendDeleteAttribute(
  client: ApiClient,
  id: string,
): Promise<null> {
  return client.delete(`/admin/catalog/attributes/${id}`);
}

export function backendAddAttributeValue(
  client: ApiClient,
  attributeId: string,
  input: BackendAttributeValueInput,
): Promise<BackendAttributeValue> {
  return client.post(`/admin/catalog/attributes/${attributeId}/values`, {
    body: input,
  });
}

export function backendUpdateAttributeValue(
  client: ApiClient,
  attributeId: string,
  valueId: string,
  input: BackendAttributeValueInput,
): Promise<BackendAttributeValue> {
  return client.patch(
    `/admin/catalog/attributes/${attributeId}/values/${valueId}`,
    { body: input },
  );
}

export function backendDeleteAttributeValue(
  client: ApiClient,
  attributeId: string,
  valueId: string,
): Promise<null> {
  return client.delete(
    `/admin/catalog/attributes/${attributeId}/values/${valueId}`,
  );
}

/** The category's attributes after inheritance, own and inherited. */
export function backendGetCategoryAttributes(
  client: ApiClient,
  categoryId: string,
): Promise<BackendCategoryAttribute[]> {
  return client.get(`/admin/catalog/categories/${categoryId}/attributes`, {
    cache: 'no-store',
  });
}

/** Replaces the category's own attributes; returns the effective list. */
export function backendSetCategoryAttributes(
  client: ApiClient,
  categoryId: string,
  input: BackendSetCategoryAttributesInput,
): Promise<BackendCategoryAttribute[]> {
  return client.put(`/admin/catalog/categories/${categoryId}/attributes`, {
    body: input,
  });
}

/** Public: a category's attributes (inherited included) with their values,
 * for any form that builds variants in that category. */
export function backendListPublicCategoryAttributes(
  client: ApiClient,
  slug: string,
): Promise<BackendCategoryAttribute[]> {
  return client.get(
    `/catalog/categories/${encodeURIComponent(slug)}/attributes`,
    { cache: 'no-store' },
  );
}
