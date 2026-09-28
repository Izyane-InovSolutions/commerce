import type {
  BackendAdminUser,
  BackendAdminUserDetail,
  BackendAdminUserQuery,
  BackendChangeUserRoleInput,
  BackendItemsPage,
  BackendSetUserStatusInput,
} from '@commerce/contracts';

import type { ApiClient, QueryValue } from '../client.ts';

/**
 * User and role administration — ADMIN only.
 *
 * Every write answers with the user as it now stands, so a caller can render
 * the result without a second read. Refusals are deliberate and worded for
 * display: 403 for acting on yourself, 409 for the last admin, a seller
 * owner, or a role that changed since it was read.
 */

export function backendListAdminUsers(
  client: ApiClient,
  query: BackendAdminUserQuery = {},
): Promise<BackendItemsPage<BackendAdminUser>> {
  return client.get('/admin/users', {
    query: query as Record<string, QueryValue>,
    cache: 'no-store',
  });
}

export function backendGetAdminUser(
  client: ApiClient,
  id: string,
): Promise<BackendAdminUserDetail> {
  return client.get(`/admin/users/${id}`, { cache: 'no-store' });
}

export function backendChangeUserRole(
  client: ApiClient,
  id: string,
  input: BackendChangeUserRoleInput,
): Promise<BackendAdminUserDetail> {
  return client.patch(`/admin/users/${id}/role`, { body: input });
}

/** Signs the user out everywhere as well; sign-in is refused until enabled. */
export function backendDisableUser(
  client: ApiClient,
  id: string,
  input: BackendSetUserStatusInput = {},
): Promise<BackendAdminUserDetail> {
  return client.post(`/admin/users/${id}/disable`, { body: input });
}

export function backendEnableUser(
  client: ApiClient,
  id: string,
  input: BackendSetUserStatusInput = {},
): Promise<BackendAdminUserDetail> {
  return client.post(`/admin/users/${id}/enable`, { body: input });
}
