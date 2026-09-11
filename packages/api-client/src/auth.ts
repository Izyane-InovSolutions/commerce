import type {
  Session,
  SignInInput,
  SignUpInput,
  User,
} from '@commerce/contracts';

import type { ApiClient } from './client.ts';

/** Authentication endpoints. */

export function signUp(
  client: ApiClient,
  input: SignUpInput,
): Promise<Session> {
  return client.post('/auth/sign-up', { body: input });
}

export function signIn(
  client: ApiClient,
  input: SignInInput,
): Promise<Session> {
  return client.post('/auth/sign-in', { body: input });
}

export function signOut(client: ApiClient): Promise<{ status: string }> {
  return client.post('/auth/sign-out');
}

/** Resolves the caller's own account, or throws 401 when not signed in. */
export function getMe(client: ApiClient): Promise<User> {
  return client.get('/auth/me', { cache: 'no-store' });
}
