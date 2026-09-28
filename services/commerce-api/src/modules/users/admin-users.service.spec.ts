import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, SellerStatus } from '@prisma/client';

import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminUsersService, assertAdminRemains } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';

const ACTOR = 'aaaaaaaa-0000-4000-8000-000000000001';
const TARGET = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('AdminUsersService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    seller: { findUnique: jest.fn() },
    session: { updateMany: jest.fn(), count: jest.fn() },
    auditEvent: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const service = new AdminUsersService(
    prisma as unknown as PrismaService,
    new AuditService(prisma as unknown as PrismaService),
  );
  const actor = { userId: ACTOR, ipAddress: '10.0.0.1' };

  /** Rows the FOR UPDATE lock returns: the actor, the target, and any other
   * active admins. */
  function locked(
    target: { role: Role; is_active: boolean } | null,
    actorRow: { role: Role; is_active: boolean } = {
      role: Role.ADMIN,
      is_active: true,
    },
  ): void {
    prisma.$queryRaw.mockResolvedValue([
      { id: ACTOR, ...actorRow },
      ...(target ? [{ id: TARGET, ...target }] : []),
    ]);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => unknown)(prisma)
        : Promise.all(arg as unknown[]),
    );
    prisma.user.findUnique.mockResolvedValue({
      id: TARGET,
      role: Role.ADMIN,
      isActive: true,
      seller: null,
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.session.updateMany.mockResolvedValue({ count: 3 });
    prisma.session.count.mockResolvedValue(0);
    prisma.seller.findUnique.mockResolvedValue(null);
  });

  describe('changeRole', () => {
    it('refuses to change the caller’s own role before touching the database', async () => {
      await expect(
        service.changeRole({ userId: ACTOR }, ACTOR, {
          role: Role.CUSTOMER,
          expectedRole: Role.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('refuses an actor who is no longer an active admin under lock', async () => {
      locked(
        { role: Role.ADMIN, is_active: true },
        { role: Role.CUSTOMER, is_active: true },
      );
      await expect(
        service.changeRole(actor, TARGET, {
          role: Role.CUSTOMER,
          expectedRole: Role.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('404s an unknown user', async () => {
      locked(null);
      await expect(
        service.changeRole(actor, TARGET, {
          role: Role.STAFF,
          expectedRole: Role.CUSTOMER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a change decided against a stale role', async () => {
      locked({ role: Role.STAFF, is_active: true });
      await expect(
        service.changeRole(actor, TARGET, {
          role: Role.ADMIN,
          expectedRole: Role.CUSTOMER,
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('treats setting the current role as a no-op', async () => {
      locked({ role: Role.STAFF, is_active: true });
      await service.changeRole(actor, TARGET, {
        role: Role.STAFF,
        expectedRole: Role.STAFF,
      });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    });

    it('demotes one of several admins, revokes their sessions and audits it', async () => {
      locked({ role: Role.ADMIN, is_active: true });
      await service.changeRole(actor, TARGET, {
        role: Role.STAFF,
        expectedRole: Role.ADMIN,
        reason: 'Moved to support',
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: TARGET, role: Role.ADMIN },
        data: { role: Role.STAFF },
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: TARGET, revokedAt: null },
        data: { revokedAt: expect.any(Date) as unknown },
      });
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorUserId: ACTOR,
          action: 'user.role_changed',
          targetType: 'User',
          targetId: TARGET,
          ipAddress: '10.0.0.1',
          metadata: {
            from: Role.ADMIN,
            to: Role.STAFF,
            reason: 'Moved to support',
            sessionsRevoked: 3,
          },
        }) as unknown,
      });
    });

    it('refuses to move a seller-account owner off SELLER', async () => {
      locked({ role: Role.SELLER, is_active: true });
      prisma.seller.findUnique.mockResolvedValue({
        status: SellerStatus.APPROVED,
      });
      await expect(
        service.changeRole(actor, TARGET, {
          role: Role.CUSTOMER,
          expectedRole: Role.SELLER,
        }),
      ).rejects.toThrow('cannot be detached');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to promote a pending seller applicant to staff', async () => {
      locked({ role: Role.CUSTOMER, is_active: true });
      prisma.seller.findUnique.mockResolvedValue({
        status: SellerStatus.PENDING,
      });
      await expect(
        service.changeRole(actor, TARGET, {
          role: Role.STAFF,
          expectedRole: Role.CUSTOMER,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('only grants SELLER to the owner of an approved seller account', async () => {
      locked({ role: Role.CUSTOMER, is_active: true });
      await expect(
        service.changeRole(actor, TARGET, {
          role: Role.SELLER,
          expectedRole: Role.CUSTOMER,
        }),
      ).rejects.toThrow('approving a seller application');

      prisma.seller.findUnique.mockResolvedValue({
        status: SellerStatus.REJECTED,
      });
      await expect(
        service.changeRole(actor, TARGET, {
          role: Role.SELLER,
          expectedRole: Role.CUSTOMER,
        }),
      ).rejects.toThrow('has not been approved');

      prisma.seller.findUnique.mockResolvedValue({
        status: SellerStatus.SUSPENDED,
      });
      await service.changeRole(actor, TARGET, {
        role: Role.SELLER,
        expectedRole: Role.CUSTOMER,
      });
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    });

    it('surfaces a lost compare-and-swap as a conflict', async () => {
      locked({ role: Role.CUSTOMER, is_active: true });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.changeRole(actor, TARGET, {
          role: Role.STAFF,
          expectedRole: Role.CUSTOMER,
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('setActive', () => {
    it('refuses to disable the caller’s own account', async () => {
      await expect(
        service.setActive({ userId: ACTOR }, ACTOR, false, {}),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('disables an account, revokes every session and audits it', async () => {
      locked({ role: Role.CUSTOMER, is_active: true });
      await service.setActive(actor, TARGET, false, { reason: 'Fraud' });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: TARGET, isActive: true },
        data: { isActive: false },
      });
      expect(prisma.session.updateMany).toHaveBeenCalled();
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'user.disabled',
          targetId: TARGET,
          metadata: {
            role: Role.CUSTOMER,
            reason: 'Fraud',
            sessionsRevoked: 3,
          },
        }) as unknown,
      });
    });

    it('re-enables without touching sessions', async () => {
      locked({ role: Role.STAFF, is_active: false });
      await service.setActive(actor, TARGET, true, {});
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: TARGET, isActive: false },
        data: { isActive: true },
      });
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'user.enabled' }) as unknown,
      });
    });

    it('is a no-op when the account is already in that state', async () => {
      locked({ role: Role.CUSTOMER, is_active: false });
      await service.setActive(actor, TARGET, false, {});
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.auditEvent.create).not.toHaveBeenCalled();
    });

    it('refuses an actor who lost admin rights to a concurrent change', async () => {
      locked(
        { role: Role.ADMIN, is_active: true },
        { role: Role.ADMIN, is_active: false },
      );
      await expect(service.setActive(actor, TARGET, false, {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertAdminRemains', () => {
    it('refuses to demote or disable the last active admin', () => {
      const admin = { role: Role.ADMIN, is_active: true };
      expect(() => assertAdminRemains(admin, 1, 'demote')).toThrow(
        'Cannot demote the last active administrator',
      );
      expect(() => assertAdminRemains(admin, 1, 'disable')).toThrow(
        ConflictException,
      );
    });

    it('allows it while another active admin remains, or for non-admins', () => {
      expect(() =>
        assertAdminRemains({ role: Role.ADMIN, is_active: true }, 2, 'demote'),
      ).not.toThrow();
      expect(() =>
        assertAdminRemains({ role: Role.ADMIN, is_active: false }, 1, 'demote'),
      ).not.toThrow();
      expect(() =>
        assertAdminRemains({ role: Role.STAFF, is_active: true }, 1, 'disable'),
      ).not.toThrow();
    });
  });

  describe('list', () => {
    it('filters by role and status and matches every search word', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: Role.ADMIN,
        isActive: true,
      });
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      const query = Object.assign(new ListAdminUsersDto(), {
        q: 'jane  doe',
        role: Role.STAFF,
        status: 'DISABLED',
        page: 2,
        limit: 10,
      });
      const page = await service.list(ACTOR, query);
      const [[args]] = prisma.user.findMany.mock.calls as [
        [{ where: unknown; skip: number }],
      ];
      expect(args.where).toMatchObject({
        role: Role.STAFF,
        isActive: false,
        AND: [
          {
            OR: expect.arrayContaining([
              { email: { contains: 'jane', mode: 'insensitive' } },
            ]) as unknown,
          },
          {
            OR: expect.arrayContaining([
              { lastName: { contains: 'doe', mode: 'insensitive' } },
            ]) as unknown,
          },
        ],
      });
      expect(args.skip).toBe(10);
      expect(page).toEqual({ items: [], total: 0, page: 2, limit: 10 });
    });

    it('refuses a caller whose admin role was revoked since the token was issued', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: Role.STAFF,
        isActive: true,
      });
      await expect(
        service.list(ACTOR, new ListAdminUsersDto()),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

describe('AdminUsersController', () => {
  it('is reachable by ADMIN only — not STAFF', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminUsersController)).toEqual([
      Role.ADMIN,
    ]);
  });
});
