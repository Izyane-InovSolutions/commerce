import type {
  BackendItemsPage,
  BackendReviewSellerInput,
  BackendSellerDetail,
  BackendSellerStatus,
  BackendSellerSummary,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * Seller administration.
 *
 * The list is a summary — five fields — so anything else about a seller
 * costs a second call for the detail. Approving, rejecting, and suspending
 * are the same review operation under three paths, and each takes the
 * version it was decided against so two administrators cannot both act on
 * what they saw.
 */

export type BackendSellerQuery = {
  page?: number;
  limit?: number;
  status?: BackendSellerStatus;
};

export function backendListSellers(
  client: ApiClient,
  query: BackendSellerQuery = {},
): Promise<BackendItemsPage<BackendSellerSummary>> {
  return client.get('/admin/sellers', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetSeller(
  client: ApiClient,
  id: string,
): Promise<BackendSellerDetail> {
  return client.get(`/admin/sellers/${id}`, { cache: 'no-store' });
}

export function backendApproveSeller(
  client: ApiClient,
  id: string,
  input: BackendReviewSellerInput,
): Promise<BackendSellerDetail> {
  return client.post(`/admin/sellers/${id}/approve`, { body: input });
}

export function backendRejectSeller(
  client: ApiClient,
  id: string,
  input: BackendReviewSellerInput,
): Promise<BackendSellerDetail> {
  return client.post(`/admin/sellers/${id}/reject`, { body: input });
}

export function backendSuspendSeller(
  client: ApiClient,
  id: string,
  input: BackendReviewSellerInput,
): Promise<BackendSellerDetail> {
  return client.post(`/admin/sellers/${id}/suspend`, { body: input });
}

/** A short-lived signed URL for one of the seller's uploaded documents. */
export function backendGetSellerDocumentUrl(
  client: ApiClient,
  id: string,
  documentId: string,
): Promise<{ url: string; expiresAt: string }> {
  return client.get(`/admin/sellers/${id}/documents/${documentId}/url`, {
    cache: 'no-store',
  });
}

/**
 * The caller's own seller account.
 *
 * 404 means they have never applied; the seller-scoped endpoints answer 403
 * until the account here reads `APPROVED`, so a portal checks this once
 * rather than interpreting a forbidden response on every other call.
 */
export function backendGetOwnSeller(
  client: ApiClient,
): Promise<BackendSellerDetail> {
  return client.get('/sellers/me', { cache: 'no-store' });
}

/**
 * The seller's public storefront: the slug it lives at, and how it presents.
 *
 * A full replacement rather than a patch — the API takes every field on each
 * write, along with the version it is working from.
 */
export function backendUpdateStorefront(
  client: ApiClient,
  input: {
    version: number;
    storefrontSlug: string;
    displayName: string;
    description: string;
  },
): Promise<{ version: number }> {
  return client.put('/sellers/me/storefront', { body: input });
}
