'use server';

import { revalidatePath } from 'next/cache';

import {
  backendChangeUserRole,
  backendDisableUser,
  backendEnableUser,
} from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { guardAction } from '@/lib/session';

import { isRole, roleLabel } from './users';

/** An optional reason: blank means none, rather than a string the API's
 * minimum length would refuse. */
function readReason(formData: FormData): string | undefined {
  const reason = String(formData.get('reason') ?? '').trim();
  return reason === '' ? undefined : reason;
}

function revalidateUser(userId: string): void {
  revalidatePath('/security');
  revalidatePath(`/security/${userId}`);
}

/**
 * Change a user's role.
 *
 * `expectedRole` is the role the page rendered. Users have no version, so the
 * API compares roles instead: if another administrator changed this one in
 * the meantime, the request is refused rather than overwriting their change.
 */
export async function changeUserRoleAction(
  userId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  const role = String(formData.get('role') ?? '');
  const expectedRole = String(formData.get('expectedRole') ?? '');
  if (!isRole(role) || !isRole(expectedRole)) {
    return { status: 'error', message: 'Choose a role.' };
  }
  if (role === expectedRole) {
    return {
      status: 'error',
      message: `This user already has the ${roleLabel(role).toLowerCase()} role.`,
    };
  }

  try {
    await backendChangeUserRole(apiClient, userId, {
      role,
      expectedRole,
      reason: readReason(formData),
    });
  } catch (error) {
    return toFormState(error);
  }

  revalidateUser(userId);
  return {
    status: 'idle',
    message: `Role changed to ${roleLabel(role).toLowerCase()}. They have been signed out everywhere.`,
  };
}

/**
 * Disable or re-enable an account. Which one arrives as a bound argument, so
 * the confirmation the user clicked is the only thing that decides it.
 */
export async function setUserActiveAction(
  userId: string,
  active: boolean,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const denied = await guardAction(true);
  if (denied) {
    return denied;
  }

  try {
    const input = { reason: readReason(formData) };
    await (active
      ? backendEnableUser(apiClient, userId, input)
      : backendDisableUser(apiClient, userId, input));
  } catch (error) {
    return toFormState(error);
  }

  revalidateUser(userId);
  return {
    status: 'idle',
    message: active
      ? 'Account enabled. They can sign in again.'
      : 'Account disabled and signed out everywhere.',
  };
}
