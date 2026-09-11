import { cache } from 'react';
import { redirect } from 'next/navigation';

import { ApiError, getMe, getMySeller } from '@commerce/api-client';
import type { Seller, User } from '@commerce/contracts';

import { apiClient } from './api';

/**
 * The signed-in user, or null.
 *
 * Cached per request so several server components can ask without each one
 * making its own call.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  try {
    return await getMe(apiClient);
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

/**
 * The store the signed-in user runs, or null if they have none yet.
 *
 * Cached per request so the shell and the page can both ask. Returns null
 * rather than throwing, because having no store is an ordinary state in this
 * portal — it is what onboarding is for.
 */
export const getCurrentSellerAccount = cache(
  async (): Promise<Seller | null> => {
    const user = await getCurrentUser();
    if (!user?.sellerId) {
      return null;
    }

    try {
      return await getMySeller(apiClient);
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        return null;
      }
      throw error;
    }
  },
);

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  return user;
}

/**
 * Guards a page that only makes sense for an approved seller.
 *
 * Someone signed in without a seller account is sent to onboarding rather
 * than shown an empty trading screen.
 */
export async function requireSeller(): Promise<User & { sellerId: string }> {
  const user = await requireUser();
  if (!user.sellerId || !user.roles.includes('seller')) {
    redirect('/apply');
  }
  return user as User & { sellerId: string };
}
