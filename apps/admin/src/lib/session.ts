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
export async function requireAdmin(adminOnly = false): Promise<BackendUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  if (!isAdmin(user)) {
    redirect('/sign-in?error=admin-only');
  }
  if (adminOnly && user.role !== 'ADMIN') redirect('/?access=restricted');
  return user;
}

/**
 * Guards a server action: null when the caller may go ahead, otherwise the
 * error state to return from the action.
 *
 * Actions are public POST endpoints, so hiding the page that renders a form is
 * not enough on its own. The API enforces roles as well; checking here means a
 * staff member gets a plain message instead of whatever a 403 parses into.
 */
export async function guardAction(
  adminOnly = false,
): Promise<{ status: 'error'; message: string } | null> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return { status: 'error', message: 'Your session has ended. Sign in again.' };
  }
  if (adminOnly && user.role !== 'ADMIN') {
    return { status: 'error', message: 'Only administrators can do this.' };
  }
  return null;
}
