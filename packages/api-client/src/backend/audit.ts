import type {
  BackendAuditEvent,
  BackendAuditEventQuery,
  BackendItemsPage,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * The audit log — every privileged action any module recorded, newest first.
 * Admin only: rows carry actor IPs and user agents.
 */
export function backendListAuditEvents(
  client: ApiClient,
  query: BackendAuditEventQuery = {},
): Promise<BackendItemsPage<BackendAuditEvent>> {
  return client.get('/admin/audit-events', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

/** Every distinct action name the log holds, for a filter's choices. */
export function backendListAuditActions(client: ApiClient): Promise<string[]> {
  return client.get('/admin/audit-events/actions', { cache: 'no-store' });
}
