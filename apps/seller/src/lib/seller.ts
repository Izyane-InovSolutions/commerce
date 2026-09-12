import { cache } from 'react';

import { ApiError, backendGetOwnSeller } from '@commerce/api-client';
import type { BackendSellerDetail } from '@commerce/contracts';

import { apiClient } from './api';

/**
 * The signed-in user's seller account, or why there isn't a usable one.
 *
 * Every seller-scoped endpoint answers 403 until the account is approved, and
 * 404 before an application exists at all. Resolving that once here means a
 * page can say which of the two it is, instead of every page having to read a
 * forbidden response and guess.
 */
export type SellerAccount =
  | { state: 'approved'; seller: BackendSellerDetail }
  | { state: 'unapproved'; seller: BackendSellerDetail }
  | { state: 'none' };

export const getSellerAccount = cache(async (): Promise<SellerAccount> => {
  let seller: BackendSellerDetail;

  try {
    seller = await backendGetOwnSeller(apiClient);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { state: 'none' };
    }
    throw error;
  }

  return seller.status === 'APPROVED'
    ? { state: 'approved', seller }
    : { state: 'unapproved', seller };
});
