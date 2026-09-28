import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { OutboxEvent } from '@prisma/client';

import { OutboxService } from './outbox.service';
import type { OutboxSubscriber } from './outbox-subscriber.interface';
import { registerRecurringTask } from './recurring-task';

export type OutboxDispatchSummary = {
  published: number;
  failed: number;
};

/**
 * The consumer side of the transactional outbox: drains PENDING events and
 * hands each to the subscribers registered for its topic.
 *
 * An event is marked PUBLISHED once every subscriber for it has returned —
 * including when no subscriber is registered for its topic, since nothing
 * in-process is waiting for it. Any subscriber throwing fails the whole
 * event, which OutboxService.markFailed retries with exponential backoff
 * until the row's maxAttempts, then moves to DEAD_LETTER.
 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly subscribers = new Map<string, OutboxSubscriber[]>();
  private readonly names = new Set<string>();

  constructor(
    private readonly outboxService: OutboxService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    registerRecurringTask(this.schedulerRegistry, this.config, {
      name: 'outbox.dispatch',
      intervalMs: Number(this.config.get('OUTBOX_DISPATCH_INTERVAL_MS', 5_000)),
      run: () => this.dispatchPending(),
      logger: this.logger,
    });
  }

  registerSubscriber(subscriber: OutboxSubscriber): void {
    if (this.names.has(subscriber.name))
      throw new Error(
        `Outbox subscriber "${subscriber.name}" is already registered`,
      );
    this.names.add(subscriber.name);
    for (const topic of subscriber.topics) {
      this.subscribers.set(topic, [
        ...(this.subscribers.get(topic) ?? []),
        subscriber,
      ]);
    }
  }

  /** Drains every deliverable event, batch by batch, until none are left. */
  async dispatchPending(): Promise<OutboxDispatchSummary> {
    const batchSize = Number(this.config.get('OUTBOX_DISPATCH_BATCH_SIZE', 50));
    const leaseMs = Number(this.config.get('OUTBOX_DISPATCH_LEASE_MS', 60_000));
    const summary: OutboxDispatchSummary = { published: 0, failed: 0 };

    let batch = await this.outboxService.claimBatch(batchSize, leaseMs);
    while (batch.length > 0) {
      for (const event of batch) {
        if (await this.dispatch(event)) summary.published += 1;
        else summary.failed += 1;
      }
      // A failed event is pushed back by its backoff, so re-claiming can't
      // spin on it; a short batch means the backlog is drained.
      if (batch.length < batchSize) break;
      batch = await this.outboxService.claimBatch(batchSize, leaseMs);
    }

    return summary;
  }

  private async dispatch(event: OutboxEvent): Promise<boolean> {
    try {
      for (const subscriber of this.subscribers.get(event.topic) ?? []) {
        try {
          await subscriber.handle(event);
        } catch (error) {
          throw new Error(
            `${subscriber.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      await this.outboxService.markPublished(event.id);
      return true;
    } catch (error) {
      this.logger.warn(
        `Outbox event ${event.id} (${event.topic}) failed on attempt ${event.attempts + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.outboxService.markFailed(event, error);
      return false;
    }
  }
}
