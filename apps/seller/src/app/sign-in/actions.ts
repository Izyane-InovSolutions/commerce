'use server';

import { redirect } from 'next/navigation';

import { signIn, signOut, signUp } from '@commerce/api-client';
import type { Session } from '@commerce/contracts';

import { apiClient } from '@/lib/api';
import { toFormState, type FormState } from '@/lib/form';
import { clearSessionToken, writeSessionToken } from '@/lib/session-cookie';

export async function signInAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let session: Session;

  try {
    session = await signIn(apiClient, {
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
    });
  } catch (error) {
    return toFormState(error);
  }

  await writeSessionToken(session.token, session.expiresAt);
  redirect(String(formData.get('next') || '/'));
}

export async function signUpAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let session: Session;

  try {
    session = await signUp(apiClient, {
      name: String(formData.get('name') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
    });
  } catch (error) {
    return toFormState(error);
  }

  await writeSessionToken(session.token, session.expiresAt);
  redirect(String(formData.get('next') || '/'));
}

export async function signOutAction(): Promise<void> {
  try {
    await signOut(apiClient);
  } catch {
    // The local cookie is cleared regardless, so a failed round trip cannot
    // strand someone in a half-signed-in state.
  }

  await clearSessionToken();
  redirect('/sign-in');
}
