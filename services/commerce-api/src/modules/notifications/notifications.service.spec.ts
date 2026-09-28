import { NotFoundException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';

function buildPrisma(): {
  notification: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
} {
  return {
    notification: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn(),
    },
  };
}

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const input = {
      userId: 'user-1',
      type: 'order.confirmed',
      title: 'Order confirmed',
      body: 'Paid.',
      link: '/orders/order-1',
      dedupeKey: 'event-1:order.confirmed:user-1',
    };

    it('creates one PENDING delivery per distinct channel', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n-1' });

      await service.create({
        ...input,
        channels: [NotificationChannel.EMAIL, NotificationChannel.EMAIL],
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dedupeKey: input.dedupeKey,
          deliveries: { create: [{ channel: NotificationChannel.EMAIL }] },
        }) as object,
      });
    });

    it('creates no delivery rows for an in-app-only notification', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n-1' });

      await service.create(input);

      const [{ data }] = prisma.notification.create.mock.calls[0] as [
        { data: { deliveries?: unknown } },
      ];
      expect(data.deliveries).toBeUndefined();
    });

    it('returns null for a replayed dedupe key instead of throwing', async () => {
      prisma.notification.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.create(input)).resolves.toBeNull();
    });

    it('rethrows any other failure', async () => {
      prisma.notification.create.mockRejectedValue(new Error('db down'));

      await expect(service.create(input)).rejects.toThrow('db down');
    });
  });

  describe('list', () => {
    it('is scoped to the caller and pages newest first', async () => {
      prisma.notification.count.mockResolvedValue(42);

      const page = await service.list('user-1', { page: 3, limit: 10 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 20,
          take: 10,
        }),
      );
      expect(page).toEqual({ items: [], total: 42, page: 3, limit: 10 });
    });

    it('filters to unread, and counts the same filter', async () => {
      await service.list('user-1', { page: 1, limit: 1, unread: true });

      const where = { userId: 'user-1', readAt: null };
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      expect(prisma.notification.count).toHaveBeenCalledWith({ where });
    });
  });

  describe('markRead', () => {
    it('only stamps an unread notification the caller owns', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });

      await service.markRead('user-1', 'n-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n-1', userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) as Date },
      });
    });

    it("404s someone else's (or a missing) notification", async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('user-1', 'n-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.notification.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n-2', userId: 'user-1' } }),
      );
    });
  });

  it('markAllRead reports how many it marked', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 4 });

    await expect(service.markAllRead('user-1')).resolves.toEqual({
      updated: 4,
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) as Date },
    });
  });
});
