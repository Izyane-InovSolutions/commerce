import { Injectable, NotFoundException } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import type {
  CreateNotificationInput,
  NotificationPage,
  NotificationView,
} from './notifications.types';

const VIEW_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the in-app notification plus one PENDING delivery row per
   * requested channel, in one statement — NotificationDeliveryService picks
   * those rows up and sends them.
   *
   * Returns null when `dedupeKey` was already used: a replayed outbox event
   * creates (and sends) nothing a second time. That is caught as the unique
   * violation rather than checked first, so two concurrent replays can't
   * both get past a check.
   */
  async create(input: CreateNotificationInput): Promise<Notification | null> {
    const channels = [...new Set(input.channels ?? [])];
    try {
      return await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          dedupeKey: input.dedupeKey,
          deliveries: channels.length
            ? { create: channels.map((channel) => ({ channel })) }
            : undefined,
        },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) return null;
      throw error;
    }
  }

  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationPage> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unread === true ? { readAt: null } : {}),
      ...(query.unread === false ? { readAt: { not: null } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: VIEW_SELECT,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  /**
   * Idempotent: an already-read notification keeps its original readAt.
   * Someone else's notification is a 404, same as a missing one, so ids
   * can't be probed.
   */
  async markRead(userId: string, id: string): Promise<NotificationView> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: VIEW_SELECT,
    });
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}

function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === code
  );
}
