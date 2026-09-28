import type { Role, SellerStatus } from '@prisma/client';

/** A user as the admin user list returns it. `seller` is the seller account
 * the user owns, if any — it decides which role changes are allowed. */
export type AdminUserSummary = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  seller: { id: string; businessName: string; status: SellerStatus } | null;
};

/** The detail view adds what only matters when looking at one user. */
export type AdminUserDetail = AdminUserSummary & {
  /** Unrevoked, unexpired refresh sessions — i.e. devices still signed in. */
  activeSessionCount: number;
};

export type AdminUserPage = {
  items: AdminUserSummary[];
  total: number;
  page: number;
  limit: number;
};

/** Who is acting, for authorization and the audit row. */
export type AdminUserActor = {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
};
