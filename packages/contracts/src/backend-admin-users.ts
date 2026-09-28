import type { BackendRole, BackendSellerStatus } from './backend.ts';

/* ---- user & role administration (/admin/users, ADMIN only) ---- */

/** Account standing as the list filters it — the API stores a boolean. */
export const backendUserStatuses = ['ACTIVE', 'DISABLED'] as const;
export type BackendUserStatus = (typeof backendUserStatuses)[number];

/**
 * A user as the admin list returns it.
 *
 * `seller` is the seller account the user owns, if any. It matters for role
 * changes: an owner can't be moved off SELLER (the account can't be detached
 * from them), and nobody reaches SELLER here without an approved one.
 */
export type BackendAdminUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: BackendRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  seller: {
    id: string;
    businessName: string;
    status: BackendSellerStatus;
  } | null;
};

/** The single-user read adds how many sessions are still signed in. */
export type BackendAdminUserDetail = BackendAdminUser & {
  activeSessionCount: number;
};

/** `q` matches email and names, every word against any of them. */
export type BackendAdminUserQuery = {
  page?: number;
  limit?: number;
  q?: string;
  role?: BackendRole;
  status?: BackendUserStatus;
};

/**
 * `PATCH /admin/users/:id/role`.
 *
 * `expectedRole` is the role the caller saw — users carry no version, so the
 * role is the compare-and-swap token and a stale one is a 409. Any change
 * revokes the user's sessions.
 */
export type BackendChangeUserRoleInput = {
  role: BackendRole;
  expectedRole: BackendRole;
  reason?: string;
};

/** `POST /admin/users/:id/disable` and `/enable`. The reason goes to the
 * audit log only. */
export type BackendSetUserStatusInput = {
  reason?: string;
};
