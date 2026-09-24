'use server';

import { redirect } from 'next/navigation';

import {
  backendRegister,
  backendSignIn,
  backendSignOut,
} from '@commerce/api-client';
import type { BackendSession } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';
import { toFormState, type FormState } from '@/lib/form';
import { clearSession, writeSession } from '@/lib/session-cookie';

function credentials(formData: FormData): {
  email: string;
  password: string;
} {
  return {
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  };
}

export async function signInAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let session: BackendSession;

  try {
    session = await backendSignIn(apiClient, credentials(formData));
  } catch (error) {
    return toFormState(error);
  }

  await writeSession(session);
  redirect(safeNext(formData.get('next'), '/'));
}

export async function signUpAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let session: BackendSession;

  try {
    session = await backendRegister(apiClient, credentials(formData));
  } catch (error) {
    return toFormState(error);
  }

  await writeSession(session);
  redirect(safeNext(formData.get('next'), '/'));
}

export async function signOutAction(): Promise<void> {
  try {
    await backendSignOut(apiClient);
  } catch {
    // The local cookies are cleared regardless, so a failed round trip cannot
    // strand someone in a half-signed-in state.
  }

  await clearSession();
  redirect('/sign-in');
}
