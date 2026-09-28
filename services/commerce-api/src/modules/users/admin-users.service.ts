import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SellerStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  AdminUserActor,
  AdminUserDetail,
  AdminUserPage,
  AdminUserSummary,
} from './admin-user';
import type { ChangeUserRoleDto } from './dto/change-user-role.dto';
import type { ListAdminUsersDto } from './dto/list-admin-users.dto';
import type { SetUserStatusDto } from './dto/set-user-status.dto';

const summarySelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  seller: { select: { id: true, businessName: true, status: true } },
} as const satisfies Prisma.UserSelect;

/** Seller statuses reached only through an approval — the ones whose owner
 * is meant to hold the SELLER role. */
const APPROVED_SELLER_STATUSES: SellerStatus[] = [
  SellerStatus.APPROVED,
  SellerStatus.SUSPENDED,
];

type LockedUser = { id: string; role: Role; is_active: boolean };

type LockedState = {
  target: LockedUser;
  /** Active ADMIN rows, re-read under lock. */
  activeAdmins: number;
};

/**
 * Refuses to take away the last active admin.
 *
 * With self-changes refused and the actor re-checked as an active admin under
 * the same lock, the count here is always at least two when the target is an
 * active admin, so this can't trip through the service today. It is kept (and
 * exported for its spec) so the rule doesn't silently depend on those two.
 */
export function assertAdminRemains(
  target: Pick<LockedUser, 'role' | 'is_active'>,
  activeAdmins: number,
  verb: 'demote' | 'disable',
): void {
  if (target.role === Role.ADMIN && target.is_active && activeAdmins <= 1)
    throw new ConflictException(`Cannot ${verb} the last active administrator`);
}

/**
 * Admin user and role management.
 *
 * Every write runs in one transaction that first row-locks the actor, the
 * target and every active ADMIN (see {@link lock}). That is what makes the
 * "never leave the platform without an active admin" rule hold under
 * concurrency: two admins demoting or disabling each other at the same time
 * serialize on the same rows, and the second one finds its own admin rights
 * gone and is refused, rather than both committing against a stale count.
 *
 * Any role change or disable revokes all of the target's sessions. The
 * access token carries the role as a claim and JwtAuthGuard only checks the
 * session, so without the revocation a demoted admin would keep admin access
 * until the token expired; a revoked session is rejected on the next request.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    actorId: string,
    query: ListAdminUsersDto,
  ): Promise<AdminUserPage> {
    await this.requireAdmin(actorId);
    const where = this.buildWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: summarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async detail(actorId: string, id: string): Promise<AdminUserDetail> {
    await this.requireAdmin(actorId);
    return this.readDetail(this.prisma, id);
  }

  /**
   * Sets a user's role.
   *
   * Seller accounts constrain this in both directions. Seller.ownerUserId is
   * a unique, non-transferable link (onDelete: Restrict) and the SELLER role
   * is what gates every seller-scoped route, so:
   * - a user who owns a seller account can't be moved off SELLER. Their
   *   offers, open seller orders, balance and payout requests would stay
   *   attached to an owner who can no longer reach any of them — and the
   *   storefront filters on seller status and owner activity, not role, so
   *   the listings would stay live. Suspending the seller (or disabling the
   *   account) is the supported way to stop one.
   * - that includes applicants still PENDING or REJECTED: approval only
   *   promotes a CUSTOMER, so moving an applicant to STAFF/ADMIN would leave a
   *   later approval with an owner who can't operate it.
   * - nobody becomes SELLER here without an approved seller account; approval
   *   through /admin/sellers is what grants it. Setting SELLER is allowed only
   *   to restore an approved (or suspended) seller's owner.
   */
  async changeRole(
    actor: AdminUserActor,
    id: string,
    dto: ChangeUserRoleDto,
  ): Promise<AdminUserDetail> {
    if (actor.userId === id)
      throw new ForbiddenException('You cannot change your own role');

    return this.prisma.$transaction(async (tx) => {
      const { target, activeAdmins } = await this.lock(tx, actor.userId, id);
      if (target.role !== dto.expectedRole)
        throw new ConflictException(
          'This user’s role has changed; reload and try again',
        );
      if (target.role === dto.role) return this.readDetail(tx, id);

      assertAdminRemains(target, activeAdmins, 'demote');

      const seller = await tx.seller.findUnique({
        where: { ownerUserId: id },
        select: { status: true },
      });
      if (seller && dto.role !== Role.SELLER)
        throw new ConflictException(
          'This user owns a seller account, which cannot be detached from them. Suspend the seller instead.',
        );
      if (dto.role === Role.SELLER && !seller)
        throw new ConflictException(
          'The seller role is granted by approving a seller application',
        );
      if (
        dto.role === Role.SELLER &&
        seller &&
        !APPROVED_SELLER_STATUSES.includes(seller.status)
      )
        throw new ConflictException(
          'This user’s seller application has not been approved; review it on the seller page',
        );

      const updated = await tx.user.updateMany({
        where: { id, role: target.role },
        data: { role: dto.role },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'This user’s role has changed; reload and try again',
        );
      const sessionsRevoked = await this.revokeSessions(tx, id);
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'user.role_changed',
          targetType: 'User',
          targetId: id,
          metadata: {
            from: target.role,
            to: dto.role,
            reason: dto.reason,
            sessionsRevoked,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return this.readDetail(tx, id);
    });
  }

  /**
   * Disables or re-enables an account. Sign-in, token refresh and handoff
   * exchange already refuse an inactive user; disabling also revokes every
   * session so the access tokens already out stop working on their next
   * request. A disabled seller's listings drop off the storefront, which
   * filters on the owner being active.
   *
   * Setting the state it's already in is a no-op (no audit row), so a
   * retried request is harmless.
   */
  async setActive(
    actor: AdminUserActor,
    id: string,
    active: boolean,
    dto: SetUserStatusDto,
  ): Promise<AdminUserDetail> {
    if (actor.userId === id)
      throw new ForbiddenException(
        active
          ? 'You cannot enable your own account'
          : 'You cannot disable your own account',
      );

    return this.prisma.$transaction(async (tx) => {
      const { target, activeAdmins } = await this.lock(tx, actor.userId, id);
      if (target.is_active === active) return this.readDetail(tx, id);

      if (!active) assertAdminRemains(target, activeAdmins, 'disable');

      const updated = await tx.user.updateMany({
        where: { id, isActive: !active },
        data: { isActive: active },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'This account changed; reload and try again',
        );
      const sessionsRevoked = active ? 0 : await this.revokeSessions(tx, id);
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: active ? 'user.enabled' : 'user.disabled',
          targetType: 'User',
          targetId: id,
          metadata: {
            role: target.role,
            reason: dto.reason,
            ...(active ? {} : { sessionsRevoked }),
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return this.readDetail(tx, id);
    });
  }

  /**
   * Locks, in id order, the actor, the target and every active ADMIN, then
   * checks the actor is still an active admin. One statement with ORDER BY
   * takes the locks in a consistent order, so two of these can't deadlock.
   * Under READ COMMITTED a row changed by a transaction we waited on is
   * re-checked against the WHERE clause, so the admin count is current.
   */
  private async lock(
    tx: Prisma.TransactionClient,
    actorId: string,
    targetId: string,
  ): Promise<LockedState> {
    const rows = await tx.$queryRaw<LockedUser[]>`
      SELECT id, role, is_active FROM users
      WHERE id IN (${actorId}::uuid, ${targetId}::uuid)
         OR (role = 'ADMIN'::"Role" AND is_active)
      ORDER BY id
      FOR UPDATE`;
    const actor = rows.find((row) => row.id === actorId);
    if (!actor?.is_active || actor.role !== Role.ADMIN)
      throw new ForbiddenException('Administrator access required');
    const target = rows.find((row) => row.id === targetId);
    if (!target) throw new NotFoundException('User not found');
    return {
      target,
      activeAdmins: rows.filter(
        (row) => row.role === Role.ADMIN && row.is_active,
      ).length,
    };
  }

  private async revokeSessions(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const { count } = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  private async readDetail(
    client: Prisma.TransactionClient,
    id: string,
  ): Promise<AdminUserDetail> {
    const user: AdminUserSummary | null = await client.user.findUnique({
      where: { id },
      select: summarySelect,
    });
    if (!user) throw new NotFoundException('User not found');
    const activeSessionCount = await client.session.count({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return { ...user, activeSessionCount };
  }

  /** Same fresh check SellersService makes: the JWT's role claim can be up to
   * one access-token lifetime old, the database can't. */
  private async requireAdmin(actorId: string): Promise<void> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true, isActive: true },
    });
    if (!actor?.isActive || actor.role !== Role.ADMIN)
      throw new ForbiddenException('Administrator access required');
  }

  private buildWhere(query: ListAdminUsersDto): Prisma.UserWhereInput {
    const words = query.q ? query.q.split(/\s+/).filter(Boolean) : [];
    return {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { isActive: query.status === 'ACTIVE' } : {}),
      ...(words.length
        ? {
            AND: words.map((word) => ({
              OR: [
                { email: { contains: word, mode: 'insensitive' as const } },
                { firstName: { contains: word, mode: 'insensitive' as const } },
                { lastName: { contains: word, mode: 'insensitive' as const } },
              ],
            })),
          }
        : {}),
    };
  }
}
