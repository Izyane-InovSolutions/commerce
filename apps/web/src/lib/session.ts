import { cache } from 'react';

import { ApiError } from '@commerce/api-client';

import { apiClient } from './api';
import type { PublicUser, SuccessEnvelope } from './auth-types';

/**
 * The signed-in user, or null.
 *
 * Cached per request so several server components can ask without each one
 * making its own call.
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  try {
    const response = await apiClient.get<SuccessEnvelope<PublicUser>>(
      '/auth/me',
      { cache: 'no-store' },
    );
    return response.data;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      return null;
    }
    throw error;
  }
});
