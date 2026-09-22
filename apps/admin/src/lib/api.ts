import { createApiClient } from '@commerce/api-client';

import { env } from './env';
import { readAccessToken } from './session-cookie';

/**
 * The portal's client for the Commerce API.
 *
 * `envelope` is on because the API wraps every response in
 * `{ data, meta: { requestId } }`; unwrapping here keeps that detail out of
 * every page. The bearer token comes from the session cookie, so it never
 * reaches the browser and no caller has to pass it.
 */
export const apiClient = createApiClient({
  baseUrl: env.apiBaseUrl,
  envelope: true,
  getAuthHeaders: async (): Promise<Record<string, string>> => {
    const token = await readAccessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  },
});
