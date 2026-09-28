import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { AuditService } from './audit.service';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';

describe('AuditService', () => {
  let prisma: {
    auditEvent: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    user: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: AuditService;

  beforeEach(() => {
    prisma = {
      auditEvent: {
        create: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    auditService = new AuditService(prisma as unknown as PrismaService);
  });

  it('writes an audit row with the given fields', async () => {
    await auditService.record({
      actorUserId: 'user-1',
      action: 'auth.login.success',
      targetType: 'User',
      targetId: 'user-1',
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'user-1',
        action: 'auth.login.success',
        targetType: 'User',
        targetId: 'user-1',
        metadata: undefined,
        ipAddress: undefined,
        userAgent: undefined,
      },
    });
  });

  it('redacts sensitive fields in metadata before persisting', async () => {
    await auditService.record({
      action: 'auth.register',
      metadata: { email: 'a@b.com', password: 'hunter2' },
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { email: 'a@b.com', password: '[REDACTED]' },
        }) as object,
      }),
    );
  });

  describe('list', () => {
    const row = (
      id: string,
      actorUserId: string | null,
    ): Record<string, unknown> => ({
      id,
      actorUserId,
      action: 'order.cancelled_by_staff',
      targetType: 'Order',
      targetId: 'order-1',
      metadata: { paymentId: null },
      ipAddress: '10.0.0.1',
      userAgent: 'jest',
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    it('filters, paginates newest-first and joins actor emails', async () => {
      prisma.auditEvent.findMany.mockResolvedValue([
        row('e2', 'user-1'),
        row('e1', null),
        row('e0', 'deleted-user'),
      ]);
      prisma.auditEvent.count.mockResolvedValue(23);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', email: 'staff@example.test' },
      ]);

      const result = await auditService.list({
        page: 2,
        limit: 10,
        action: 'order.cancelled_by_staff',
        actorUserId: '4b0c1c1e-3f7e-4b8a-9d57-2f0a6d1d0a11',
        targetType: 'Order',
        targetId: 'order-1',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T00:00:00.000Z',
      } as ListAuditEventsDto);

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith({
        where: {
          action: 'order.cancelled_by_staff',
          actorUserId: '4b0c1c1e-3f7e-4b8a-9d57-2f0a6d1d0a11',
          targetType: 'Order',
          targetId: 'order-1',
          createdAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-09-30T00:00:00.000Z'),
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 10,
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['user-1', 'deleted-user'] } },
        select: { id: true, email: true },
      });
      expect(result.total).toBe(23);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.items.map((item) => item.actorEmail)).toEqual([
        'staff@example.test',
        null,
        null,
      ]);
      expect(result.items[0]).toEqual({
        id: 'e2',
        actorUserId: 'user-1',
        actorEmail: 'staff@example.test',
        action: 'order.cancelled_by_staff',
        targetType: 'Order',
        targetId: 'order-1',
        metadata: { paymentId: null },
        ipAddress: '10.0.0.1',
        userAgent: 'jest',
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
      });
    });

    it('applies no filters by default and skips the user lookup when empty', async () => {
      const result = await auditService.list({
        page: 1,
        limit: 20,
      } as ListAuditEventsDto);

      expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20 }),
      );
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });

    it('rejects a `to` before `from`', async () => {
      await expect(
        auditService.list({
          page: 1,
          limit: 20,
          from: '2026-09-02T00:00:00.000Z',
          to: '2026-09-01T00:00:00.000Z',
        } as ListAuditEventsDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('lists distinct actions alphabetically', async () => {
    prisma.auditEvent.findMany.mockResolvedValue([
      { action: 'auth.login.success' },
      { action: 'order.cancelled_by_customer' },
    ]);

    await expect(auditService.listActions()).resolves.toEqual([
      'auth.login.success',
      'order.cancelled_by_customer',
    ]);
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
  });
});
