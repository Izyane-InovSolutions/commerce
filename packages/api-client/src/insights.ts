import type { AdminInsights, SellerInsights } from '@commerce/contracts';

import type { ApiClient } from './client.ts';

/**
 * Derived dashboard figures.
 *
 * One request per dashboard: the API does the joining, so a client never has
 * to fetch every list and compute totals itself.
 */

export function getSellerInsights(client: ApiClient): Promise<SellerInsights> {
  return client.get('/seller/insights', { cache: 'no-store' });
}

export function getAdminInsights(client: ApiClient): Promise<AdminInsights> {
  return client.get('/admin/insights', { cache: 'no-store' });
}
