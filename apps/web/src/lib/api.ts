import { createApiClient } from '@commerce/api-client';

import { env } from './env';
import { readAccessToken } from './session-cookie';

/**
 * Storefront client for the Commerce API.
 *
 * Credentials are attached here from the session cookie, so no caller has to
 * know about them and the token never reaches the browser. Authorization
 * itself is enforced by the API — the storefront only decides what to show.
 */
export const apiClient = createApiClient({
  baseUrl: env.apiBaseUrl,
  getAuthHeaders: async (): Promise<Record<string, string>> => {
    const token = await readAccessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  },
});
