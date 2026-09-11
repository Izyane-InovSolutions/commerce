import type {
  CreateSellerApplicationInput,
  Paginated,
  Seller,
  SellerApplication,
  SellerApplicationListQuery,
  SellerListQuery,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from './client.ts';

/** Seller accounts and the onboarding queue. */

export function listSellers(
  client: ApiClient,
  query: Partial<SellerListQuery> = {},
): Promise<Paginated<Seller>> {
  return client.get('/sellers', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function suspendSeller(
  client: ApiClient,
  sellerId: string,
): Promise<Seller> {
  return client.post(`/sellers/${sellerId}/suspend`);
}

export function reinstateSeller(
  client: ApiClient,
  sellerId: string,
): Promise<Seller> {
  return client.post(`/sellers/${sellerId}/reinstate`);
}

export function listSellerApplications(
  client: ApiClient,
  query: Partial<SellerApplicationListQuery> = {},
): Promise<Paginated<SellerApplication>> {
  return client.get('/seller-applications', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/** The caller's own most recent application, or null if they never applied. */
export function getMyApplication(
  client: ApiClient,
): Promise<SellerApplication | null> {
  return client.get('/seller-applications/mine', { cache: 'no-store' });
}

export function createSellerApplication(
  client: ApiClient,
  input: CreateSellerApplicationInput,
): Promise<SellerApplication> {
  return client.post('/seller-applications', { body: input });
}

export function approveSellerApplication(
  client: ApiClient,
  applicationId: string,
): Promise<SellerApplication> {
  return client.post(`/seller-applications/${applicationId}/approve`);
}

export function rejectSellerApplication(
  client: ApiClient,
  applicationId: string,
  reason: string,
): Promise<SellerApplication> {
  return client.post(`/seller-applications/${applicationId}/reject`, {
    body: { reason },
  });
}

/**
 * The caller's own seller account.
 *
 * Separate from `/auth/me` because the user and the store are different
 * things: a user has one identity and may or may not have a store.
 */
export function getMySeller(client: ApiClient): Promise<Seller> {
  return client.get('/sellers/me', { cache: 'no-store' });
}
