import { cache } from 'react';
import { redirect } from 'next/navigation';

import { ApiError, backendGetMe } from '@commerce/api-client';
import type { BackendUser } from '@commerce/contracts';

import { apiClient } from './api';

/**
 * The signed-in user, or null.
 *
 * Cached per request so several server components can ask without each one
 * making its own call.
 */
export const getCurrentUser = cache(async (): Promise<BackendUser | null> => {
  try {
    return await backendGetMe(apiClient);
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

export async function requireUser(): Promise<BackendUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  return user;
}

/**
 * Whether this account carries the seller role.
 *
 * Not the same question as whether they can trade: that depends on the seller
 * account behind the user being approved, which `getSellerAccount` answers.
 * The API enforces both independently.
 */
export function isSeller(user: BackendUser | null): boolean {
  return user?.role === 'SELLER';
}
