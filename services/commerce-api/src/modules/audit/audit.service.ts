import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { redact } from '../../infrastructure/logging/redact';
import {
  AuditEventPage,
  AuditEventView,
  RecordAuditEventInput,
} from './audit-event';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';

type AuditClient = Pick<Prisma.TransactionClient, 'auditEvent'>;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `client`, when given, writes the audit row inside the caller's own
   * transaction — used by procurement so a posted receipt and the audit
   * event that explains it commit or roll back together.
   */
  async record(
    event: RecordAuditEventInput,
    client: AuditClient = this.prisma,
  ): Promise<void> {
    await client.auditEvent.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata
          ? (redact(event.metadata) as Prisma.InputJsonValue)
          : undefined,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      },
    });
  }

  /**
   * The admin audit log, newest first. Metadata is returned as stored —
   * already redacted on write by {@link record}.
   */
  async list(query: ListAuditEventsDto): Promise<AuditEventPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    // audit_events deliberately has no FK to users (an audit row must
    // outlive the account it describes), so emails are joined by hand.
    const actorIds = [
      ...new Set(
        rows
          .map((row) => row.actorUserId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailById = new Map(actors.map((actor) => [actor.id, actor.email]));

    const items: AuditEventView[] = rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorEmail: row.actorUserId
        ? (emailById.get(row.actorUserId) ?? null)
        : null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
    }));

    return { items, total, page, limit };
  }

  /** Every distinct action ever recorded, alphabetically — feeds the audit
   * log's action filter. */
  async listActions(): Promise<string[]> {
    const rows = await this.prisma.auditEvent.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return rows.map((row) => row.action);
  }

  private buildWhere(query: ListAuditEventsDto): Prisma.AuditEventWhereInput {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && to.getTime() < from.getTime())
      throw new BadRequestException('`to` must not be before `from`.');

    return {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
  }
}
