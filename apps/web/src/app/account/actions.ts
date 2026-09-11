'use server';

import { redirect } from 'next/navigation';

import { apiClient } from '@/lib/api';
import type { AuthTokens, SuccessEnvelope } from '@/lib/auth-types';
import { toFormState, type FormState } from '@/lib/form';
import {
  clearSession,
  readRefreshToken,
  writeSession,
} from '@/lib/session-cookie';

export async function signInAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let tokens: AuthTokens;

  try {
    const response = await apiClient.post<SuccessEnvelope<AuthTokens>>(
      '/auth/login',
      {
        body: {
          email: String(formData.get('email') ?? '').trim(),
          password: String(formData.get('password') ?? ''),
        },
      },
    );
    tokens = response.data;
  } catch (error) {
    return toFormState(error);
  }

  await writeSession(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
  redirect(String(formData.get('next') || '/account'));
}

export async function signUpAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  let tokens: AuthTokens;

  try {
    const response = await apiClient.post<SuccessEnvelope<AuthTokens>>(
      '/auth/register',
      {
        body: {
          email: String(formData.get('email') ?? '').trim(),
          password: String(formData.get('password') ?? ''),
        },
      },
    );
    tokens = response.data;
  } catch (error) {
    return toFormState(error);
  }

  await writeSession(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
  redirect(String(formData.get('next') || '/account'));
}

export async function signOutAction(): Promise<void> {
  const refreshToken = await readRefreshToken();

  if (refreshToken) {
    try {
      await apiClient.post('/auth/logout', { body: { refreshToken } });
    } catch {
      // The local cookie is cleared regardless, so a failed round trip cannot
      // strand someone in a half-signed-in state.
    }
  }

  await clearSession();
  redirect('/account');
}
