import type { OutboxEvent } from '@prisma/client';

/**
 * Reacts to outbox events of the given topics, registered with
 * OutboxDispatcherService (see WorkersModule for where that happens).
 *
 * Delivery is at least once: an event whose dispatch fails is retried in
 * full, re-running every subscriber for its topic, including those that had
 * already succeeded. `handle` must therefore be idempotent — key any write
 * it makes on `event.id` rather than assuming it runs once.
 */
export interface OutboxSubscriber {
  /** Stable, unique name used in logs and failure messages. */
  readonly name: string;
  readonly topics: readonly string[];
  handle(event: OutboxEvent): Promise<void>;
}
