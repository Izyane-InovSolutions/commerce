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
