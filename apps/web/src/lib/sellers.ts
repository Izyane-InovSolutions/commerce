import { cache } from 'react';

import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
import type { SuccessEnvelope } from './auth-types';

/**
 * Local mirror of the Commerce API's seller application shape — same rule as
 * `commerce-types.ts`: only the fields the account page actually shows.
 */
export type SellerStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type OwnSeller = {
  status: SellerStatus;
  businessName: string;
  reviewReason: string | null;
};

/**
 * The signed-in user's own seller application, or null if they've never
 * applied — `GET /sellers/me` 404s in that case rather than returning
 * nothing, mirroring how apps/seller's own `getSellerAccount` reads it.
 *
 * Cached per request so the account page can check this alongside its other
 * `Promise.all`'d reads without a second round trip.
 */
export const getOwnSeller = cache(async (): Promise<OwnSeller | null> => {
  try {
    const response = await apiClient.get<SuccessEnvelope<OwnSeller>>(
      '/sellers/me',
      { cache: 'no-store' },
    );
    return response.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
});
