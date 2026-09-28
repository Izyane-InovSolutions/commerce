import {
  ApiError,
  createApiClient,
  type ApiClient,
  type ApiRequestOptions,
  type HttpMethod,
} from '@commerce/api-client';

import { env } from './env';
import {
  readAccessToken,
  renewSessionAfterUnauthorized,
} from './session-cookie';

const baseClient = createApiClient({
  baseUrl: env.apiBaseUrl,
  getAuthHeaders: async (): Promise<Record<string, string>> => {
    const token = await readAccessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  },
});

/**
 * Public auth routes answer 401 for their own reasons — a wrong password, a
 * spent reset link — which no amount of renewing the session would change.
 */
const NO_RENEW_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/password-reset/',
  '/auth/handoff/exchange',
];

async function request<T>(
  method: HttpMethod,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  try {
    return await baseClient.request<T>(method, path, options);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      NO_RENEW_PATHS.some((prefix) => path.startsWith(prefix))
    ) {
      throw error;
    }

    const accessToken = await renewSessionAfterUnauthorized();
    if (!accessToken) {
      throw error;
    }

    // The API's guard refused the first attempt before it did anything, so
    // sending it again — idempotency key and all — is safe.
    return baseClient.request<T>(method, path, {
      ...options,
      headers: { ...options.headers, authorization: `Bearer ${accessToken}` },
    });
  }
}

/**
 * Storefront client for the Commerce API.
 *
 * Credentials are attached here from the session cookie, so no caller has to
 * know about them and the token never reaches the browser. Authorization
 * itself is enforced by the API — the storefront only decides what to show.
 *
 * A 401 from a token that expired mid-request is renewed and retried once
 * (see `renewSessionAfterUnauthorized`); renewing ahead of expiry is
 * `proxy.ts`'s job.
 */
export const apiClient: ApiClient = {
  baseUrl: baseClient.baseUrl,
  envelope: baseClient.envelope,
  request,
  get: (path, options) => request('GET', path, options),
  post: (path, options) => request('POST', path, options),
  patch: (path, options) => request('PATCH', path, options),
  put: (path, options) => request('PUT', path, options),
  delete: (path, options) => request('DELETE', path, options),
};
