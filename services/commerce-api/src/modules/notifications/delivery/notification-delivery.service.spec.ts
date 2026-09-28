import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import type { NotificationChannelSender } from './notification-channel';
import {
  MAX_DELIVERY_ATTEMPTS,
  NotificationDeliveryService,
  retryDelayMs,
} from './notification-delivery.service';

const NOW = new Date('2026-09-28T12:00:00Z');

function buildPrisma(): {
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  notificationDelivery: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
} {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]),
    $transaction: jest.fn(),
    notificationDelivery: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  prisma.$transaction.mockImplementation(
    (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
  return prisma;
}

function deliveryRow(overrides: Record<string, unknown> = {}): object {
  return {
    id: 'd-1',
    channel: NotificationChannel.EMAIL,
    attempts: 1,
    notification: {
      type: 'order.confirmed',
      title: 'Order confirmed',
      body: 'Paid.',
      link: '/orders/order-1',
      user: { email: 'user@example.com', phone: null },
    },
    ...overrides,
  };
}

describe('NotificationDeliveryService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let email: {
    channel: NotificationChannel;
    provider: string;
    recipientFor: jest.Mock;
    send: jest.Mock;
  };
  let service: NotificationDeliveryService;

  beforeEach(() => {
    prisma = buildPrisma();
    email = {
      channel: NotificationChannel.EMAIL,
      provider: 'smtp',
      recipientFor: jest.fn((user: { email: string }) => user.email),
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    service = new NotificationDeliveryService(
      prisma as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
      {} as SchedulerRegistry,
      [email as unknown as NotificationChannelSender],
    );
  });

  it('does nothing while another replica holds the sweep lock', async () => {
    prisma.$queryRaw.mockResolvedValue([{ acquired: false }]);

    await expect(service.sweep(NOW)).resolves.toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    expect(prisma.notificationDelivery.findMany).not.toHaveBeenCalled();
  });

  it('claims a due row conditionally on what it read, then sends it', async () => {
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        id: 'd-1',
        status: NotificationDeliveryStatus.PENDING,
        attempts: 0,
        updatedAt: NOW,
      },
    ]);
    prisma.notificationDelivery.findUniqueOrThrow.mockResolvedValue(
      deliveryRow(),
    );

    const summary = await service.sweep(NOW);

    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'd-1',
        status: NotificationDeliveryStatus.PENDING,
        attempts: 0,
      },
      data: {
        status: NotificationDeliveryStatus.PENDING,
        attempts: { increment: 1 },
        updatedAt: NOW,
      },
    });
    expect(email.send).toHaveBeenCalledWith(
      'user@example.com',
      expect.objectContaining({ title: 'Order confirmed' }),
    );
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd-1' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.SENT,
        provider: 'smtp',
        recipient: 'user@example.com',
        providerMessageId: 'msg-1',
        lastError: null,
      }) as object,
    });
    expect(summary).toEqual({ sent: 1, failed: 0, skipped: 0 });
  });

  it('does not send a row another sweep claimed first', async () => {
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        id: 'd-1',
        status: NotificationDeliveryStatus.PENDING,
        attempts: 0,
        updatedAt: NOW,
      },
    ]);
    prisma.notificationDelivery.updateMany.mockResolvedValue({ count: 0 });

    await service.sweep(NOW);

    expect(email.send).not.toHaveBeenCalled();
  });

  it('retries a failed row only once its backoff has passed', async () => {
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        id: 'not-yet',
        status: NotificationDeliveryStatus.FAILED,
        attempts: 2,
        updatedAt: new Date(NOW.getTime() - retryDelayMs(2) + 1_000),
      },
      {
        id: 'due',
        status: NotificationDeliveryStatus.FAILED,
        attempts: 2,
        updatedAt: new Date(NOW.getTime() - retryDelayMs(2)),
      },
    ]);
    prisma.notificationDelivery.findUniqueOrThrow.mockResolvedValue(
      deliveryRow({ id: 'due' }),
    );

    await service.sweep(NOW);

    const claimed = prisma.notificationDelivery.updateMany.mock.calls.map(
      ([args]: [{ where: { id: string } }]) => args.where.id,
    );
    expect(claimed).toEqual(['due']);
  });

  it('only selects failed rows with attempts left', async () => {
    await service.sweep(NOW);

    const [{ where }] = prisma.notificationDelivery.findMany.mock.calls[0] as [
      { where: { OR: object[] } },
    ];
    expect(where.OR).toContainEqual({
      status: NotificationDeliveryStatus.FAILED,
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
    });
  });

  it('records a send failure as FAILED with the reason', async () => {
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        id: 'd-1',
        status: NotificationDeliveryStatus.PENDING,
        attempts: 0,
        updatedAt: NOW,
      },
    ]);
    prisma.notificationDelivery.findUniqueOrThrow.mockResolvedValue(
      deliveryRow(),
    );
    email.send.mockRejectedValue(new Error('550 mailbox unavailable'));

    const summary = await service.sweep(NOW);

    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd-1' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.FAILED,
        lastError: '550 mailbox unavailable',
      }) as object,
    });
    expect(summary.failed).toBe(1);
  });

  it('skips a channel that has no provider (SMS) instead of leaving it pending', async () => {
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        id: 'd-2',
        status: NotificationDeliveryStatus.PENDING,
        attempts: 0,
        updatedAt: NOW,
      },
    ]);
    prisma.notificationDelivery.findUniqueOrThrow.mockResolvedValue(
      deliveryRow({ id: 'd-2', channel: NotificationChannel.SMS }),
    );

    const summary = await service.sweep(NOW);

    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd-2' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.SKIPPED,
      }) as object,
    });
    expect(summary.skipped).toBe(1);
  });
});
