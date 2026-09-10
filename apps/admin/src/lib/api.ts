import { createApiClient } from '@commerce/api-client';

import { env } from './env';

/**
 * Admin portal client for the Commerce API.
 *
 * Credentials are attached in `getAuthHeaders` once the auth module is wired
 * up, so no caller has to know about them. Authorization itself is enforced by
 * the API — the portal only decides what to show.
 */
export const apiClient = createApiClient({ baseUrl: env.apiBaseUrl });
