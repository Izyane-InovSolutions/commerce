import { ConflictException, Injectable } from '@nestjs/common';
import { BackgroundJob, BackgroundJobStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../database/prisma.service';

export type EnqueueJobInput = {
  type: string;
  payload: Prisma.InputJsonValue;
  runAt?: Date;
  maxAttempts?: number;
};

@Injectable()
export class BackgroundJobsService {
  constructor(private readonly prisma: PrismaService) {}

  enqueue(
    input: EnqueueJobInput,
    client: Pick<Prisma.TransactionClient, 'backgroundJob'> = this.prisma,
  ): Promise<BackgroundJob> {
    return client.backgroundJob.create({
      data: {
        type: input.type,
        payload: input.payload,
        runAt: input.runAt,
        maxAttempts: input.maxAttempts,
      },
    });
  }

  async claimNext(
    staleAfterMs = 5 * 60 * 1_000,
  ): Promise<BackgroundJob | null> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - staleAfterMs);

    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.backgroundJob.findFirst({
        where: {
          OR: [
            { status: BackgroundJobStatus.PENDING, runAt: { lte: now } },
            {
              status: BackgroundJobStatus.RUNNING,
              lockedAt: { lte: staleBefore },
            },
          ],
        },
        orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
      });

      if (!candidate) {
        return null;
      }

      const lockToken = randomUUID();
      const claimed = await transaction.backgroundJob.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          updatedAt: candidate.updatedAt,
        },
        data: {
          status: BackgroundJobStatus.RUNNING,
          attempts: { increment: 1 },
          lockedAt: now,
          lockToken,
        },
      });

      if (claimed.count !== 1) {
        return null;
      }

      return transaction.backgroundJob.findUnique({
        where: { id: candidate.id },
      });
    });
  }

  async complete(id: string, lockToken: string): Promise<void> {
    const result = await this.prisma.backgroundJob.updateMany({
      where: { id, lockToken, status: BackgroundJobStatus.RUNNING },
      data: {
        status: BackgroundJobStatus.SUCCEEDED,
        completedAt: new Date(),
        lockedAt: null,
        lockToken: null,
        lastError: null,
      },
    });

    if (result.count !== 1) {
      throw new ConflictException('The background job lock is no longer valid');
    }
  }

  async fail(id: string, lockToken: string, error: unknown): Promise<void> {
    const job = await this.prisma.backgroundJob.findFirst({
      where: { id, lockToken, status: BackgroundJobStatus.RUNNING },
    });

    if (!job) {
      throw new ConflictException('The background job lock is no longer valid');
    }

    const exhausted = job.attempts >= job.maxAttempts;
    const retryDelayMs = Math.min(60_000, 1_000 * 2 ** job.attempts);

    await this.prisma.backgroundJob.update({
      where: { id },
      data: {
        status: exhausted
          ? BackgroundJobStatus.DEAD_LETTER
          : BackgroundJobStatus.PENDING,
        runAt: exhausted ? job.runAt : new Date(Date.now() + retryDelayMs),
        lockedAt: null,
        lockToken: null,
        lastError: this.describeError(error),
      },
    });
  }

  private describeError(error: unknown): string {
    const description = error instanceof Error ? error.message : String(error);
    return description.slice(0, 4_000);
  }
}
