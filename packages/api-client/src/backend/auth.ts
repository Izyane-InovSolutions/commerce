import type {
  BackendCredentials,
  BackendSession,
  BackendUser,
} from '@commerce/contracts';

import type { ApiClient } from '../client.ts';

/** Authentication against the real API. */

export function backendSignIn(
  client: ApiClient,
  input: BackendCredentials,
): Promise<BackendSession> {
  return client.post('/auth/login', { body: input });
}

export function backendRegister(
  client: ApiClient,
  input: BackendCredentials,
): Promise<BackendSession> {
  return client.post('/auth/register', { body: input });
}

export function backendSignOut(client: ApiClient): Promise<null> {
  return client.post('/auth/logout');
}

/** The caller's own account. Throws 401 when the access token has expired. */
export function backendGetMe(client: ApiClient): Promise<BackendUser> {
  return client.get('/auth/me', { cache: 'no-store' });
}

export function backendRefresh(
  client: ApiClient,
  refreshToken: string,
): Promise<BackendSession> {
  return client.post('/auth/refresh', { body: { refreshToken } });
}
