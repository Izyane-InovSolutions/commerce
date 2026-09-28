import { Injectable } from '@nestjs/common';
import { OutboxEvent, OutboxEventStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

type OutboxClient = Pick<Prisma.TransactionClient, 'outboxEvent'>;

export type RecordOutboxEventInput = {
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
};

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    input: RecordOutboxEventInput,
    client: OutboxClient = this.prisma,
  ): Promise<OutboxEvent> {
    return client.outboxEvent.create({ data: input });
  }

  /**
   * Leases up to `limit` deliverable events, oldest first, to one dispatcher.
   *
   * An event is deliverable only once every earlier PENDING event for the
   * same aggregate has been delivered or dead-lettered, so subscribers see
   * one aggregate's events in the order they were written even across
   * retries. SKIP LOCKED lets several API instances drain concurrently
   * without claiming the same rows, and the lease — pushing `availableAt`
   * forward rather than adding a lock column — makes an event claimed by a
   * process that then dies deliverable again once the lease runs out.
   */
  async claimBatch(limit: number, leaseMs: number): Promise<OutboxEvent[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT e.id FROM outbox_events e
        WHERE e.status = 'PENDING' AND e.available_at <= now()
          AND NOT EXISTS (
            SELECT 1 FROM outbox_events earlier
            WHERE earlier.aggregate_type = e.aggregate_type
              AND earlier.aggregate_id = e.aggregate_id
              AND earlier.status = 'PENDING'
              AND (earlier.created_at, earlier.id) < (e.created_at, e.id)
          )
        ORDER BY e.created_at, e.id
        LIMIT ${limit}
        FOR UPDATE OF e SKIP LOCKED
      `;
      if (rows.length === 0) return [];

      const ids = rows.map((row) => row.id);
      await tx.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: { availableAt: new Date(Date.now() + leaseMs) },
      });
      return tx.outboxEvent.findMany({
        where: { id: { in: ids } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });
  }

  listPending(limit = 100): Promise<OutboxEvent[]> {
    return this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxEventStatus.PENDING,
        availableAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.PUBLISHED,
        publishedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
      },
    });
  }

  async markFailed(event: OutboxEvent, error: unknown): Promise<void> {
    const attempts = event.attempts + 1;
    const exhausted = attempts >= event.maxAttempts;

    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: exhausted
          ? OutboxEventStatus.DEAD_LETTER
          : OutboxEventStatus.PENDING,
        attempts,
        availableAt: new Date(
          Date.now() + Math.min(60_000, 1_000 * 2 ** attempts),
        ),
        lastError: (error instanceof Error
          ? error.message
          : String(error)
        ).slice(0, 4_000),
      },
    });
  }
}
