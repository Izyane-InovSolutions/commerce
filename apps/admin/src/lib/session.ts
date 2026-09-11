import { cache } from 'react';
import { redirect } from 'next/navigation';

import { ApiError, getMe } from '@commerce/api-client';
import type { User } from '@commerce/contracts';

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
 * Guards an admin page.
 *
 * The API enforces this too; the redirect exists so a signed-out visitor gets
 * a sign-in form instead of an error.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  if (!user.roles.includes('admin')) {
    redirect('/sign-in?error=admin-only');
  }
  return user;
}
