import {
  backendRoles,
  backendUserStatuses,
  type BackendAdminUser,
  type BackendAdminUserQuery,
  type BackendRole,
  type BackendUserStatus,
} from '@commerce/contracts';

import { readParam, type RawSearchParams } from '@/lib/search-params';

export const USERS_PAGE_SIZE = 20;

export type UserFilters = {
  page: number;
  q?: string;
  role?: BackendRole;
  status?: BackendUserStatus;
};

export function isRole(value: string): value is BackendRole {
  return (backendRoles as readonly string[]).includes(value);
}

function isUserStatus(value: string): value is BackendUserStatus {
  return (backendUserStatuses as readonly string[]).includes(value);
}

/**
 * The list's filters as the URL carries them. Anything unrecognised is
 * dropped rather than forwarded, so a hand-edited link shows an unfiltered
 * list instead of a validation error from the API.
 */
export function readUserFilters(params: RawSearchParams): UserFilters {
  const requested = Number(readParam(params, 'page') ?? '1');
  const q = readParam(params, 'q')?.trim().slice(0, 200);
  const role = readParam(params, 'role');
  const status = readParam(params, 'status');
  return {
    page: Number.isInteger(requested) && requested > 0 ? requested : 1,
    q: q ? q : undefined,
    role: role !== undefined && isRole(role) ? role : undefined,
    status: status !== undefined && isUserStatus(status) ? status : undefined,
  };
}

export function isUserFiltered(filters: UserFilters): boolean {
  return (
    filters.q !== undefined ||
    filters.role !== undefined ||
    filters.status !== undefined
  );
}

export function toAdminUserQuery(filters: UserFilters): BackendAdminUserQuery {
  return { ...filters, limit: USERS_PAGE_SIZE };
}

export function roleLabel(role: BackendRole): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

/** "Jane Doe", or null when the user never gave a name. */
export function fullName(
  user: Pick<BackendAdminUser, 'firstName' | 'lastName'>,
): string | null {
  const name = [user.firstName, user.lastName]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(' ');
  return name === '' ? null : name;
}

/**
 * Why the role can't be changed from this page, if it can't — so the form
 * says so up front instead of offering choices the API will refuse. These
 * mirror the API's rules; the API still decides, and anything it refuses for
 * another reason (the last admin, a role changed by someone else) comes back
 * through the form.
 */
export function roleChangeBlocker(
  user: Pick<BackendAdminUser, 'id' | 'role' | 'seller'>,
  currentUserId: string,
): string | null {
  if (user.id === currentUserId) {
    return 'You cannot change your own role. Another administrator has to.';
  }
  if (user.seller && user.role === 'SELLER') {
    return 'This user owns a seller account, which cannot be detached from them. To stop them selling, suspend the seller instead.';
  }
  if (user.seller && user.role === 'CUSTOMER') {
    return 'This user has a seller application. Its review decides their role — approve it to make them a seller.';
  }
  return null;
}

/**
 * Roles worth offering. SELLER only comes from approving an application, so
 * it is offered only to restore the owner of an approved (or suspended)
 * seller account.
 */
export function assignableRoles(
  user: Pick<BackendAdminUser, 'seller'>,
): BackendRole[] {
  const sellerApproved =
    user.seller?.status === 'APPROVED' || user.seller?.status === 'SUSPENDED';
  return backendRoles.filter((role) => role !== 'SELLER' || sellerApproved);
}
