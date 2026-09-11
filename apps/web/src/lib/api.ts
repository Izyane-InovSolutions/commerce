import { createApiClient } from '@commerce/api-client';

import { env } from './env';

/**
 * Storefront client for the Commerce API.
 *
 * Customer requests are currently anonymous; session credentials are attached
 * here once the auth module is wired up, so no caller has to know about them.
 */
export const apiClient = createApiClient({ baseUrl: env.apiBaseUrl });
