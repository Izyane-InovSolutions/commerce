import { cache } from 'react';
import { redirect } from 'next/navigation';

import { ApiError, backendGetMe } from '@commerce/api-client';
import type { BackendUser } from '@commerce/contracts';

import { apiClient } from './api';

/** Roles the admin portal is for. The API enforces this independently. */
const ADMIN_ROLES = ['ADMIN', 'STAFF'];

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

export function isAdmin(user: BackendUser | null): boolean {
  return user !== null && ADMIN_ROLES.includes(user.role);
}

/**
 * Guards an admin page.
 *
 * The API enforces this too; the redirect exists so a signed-out visitor gets
 * a sign-in form instead of an error.
 */
export async function requireAdmin(): Promise<BackendUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  if (!isAdmin(user)) {
    redirect('/sign-in?error=admin-only');
  }
  return user;
}
