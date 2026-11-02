import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../../src/database/prisma.service';

/**
 * Explicit barriers for integration specs that need one interleaving, not a
 * likely one: a promise the test resolves itself, a condition poll, and a row
 * lock held open in a transaction the test controls. Nothing here sleeps for
 * a fixed time and hopes the other side got there first.
 */
export type Deferred<T = void> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Polls `condition` until it holds; fails (naming it) after `timeoutMs`. */
export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  description: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting until ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A promise plus whether it has settled yet, for counting finished requests. */
export type Tracked<T> = { promise: Promise<T>; settled: boolean };

export function track<T>(work: PromiseLike<T>): Tracked<T> {
  const tracked: Tracked<T> = {
    promise: Promise.resolve(work),
    settled: false,
  };
  tracked.promise.then(
    () => (tracked.settled = true),
    () => (tracked.settled = true),
  );
  return tracked;
}

export type HeldLock = {
  /** The backend holding the lock, for pg_blocking_pids() checks. */
  pid: number;
  /** Commits the holding transaction, letting every waiter proceed. */
  release(): Promise<void>;
};

/**
 * Runs `lock` in its own transaction and keeps that transaction open until
 * `release()`, so the rows it locked stay locked while the spec drives a
 * competing request into them.
 */
export async function holdLock(
  prisma: PrismaService,
  lock: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<HeldLock> {
  const ready = deferred<number>();
  const done = deferred();
  const transaction = prisma.$transaction(async (tx) => {
    await lock(tx);
    const [row] = await tx.$queryRaw<
      { pid: number }[]
    >`SELECT pg_backend_pid() AS pid`;
    ready.resolve(row!.pid);
    await done.promise;
  });
  transaction.catch((error: unknown) => ready.reject(error));
  const pid = await ready.promise;
  return {
    pid,
    release: async (): Promise<void> => {
      done.resolve();
      await transaction;
    },
  };
}

/**
 * Waits until at least `count` backends are waiting on a lock held by `pid`
 * (depth 1), or on a lock held by a backend that is itself waiting on `pid`
 * (depth 2: a request stuck behind a request stuck behind the test's lock).
 */
export async function waitForLockWaiters(
  prisma: PrismaService,
  pid: number,
  { depth = 1, count = 1 }: { depth?: 1 | 2; count?: number } = {},
): Promise<void> {
  await waitUntil(async () => {
    const [row] =
      depth === 1
        ? await prisma.$queryRaw<{ waiting: number }[]>`
            SELECT count(*)::int AS waiting FROM pg_stat_activity
            WHERE wait_event_type = 'Lock'
              AND ${pid}::int = ANY(pg_blocking_pids(pid))`
        : await prisma.$queryRaw<{ waiting: number }[]>`
            SELECT count(*)::int AS waiting FROM pg_stat_activity waiter
            WHERE waiter.wait_event_type = 'Lock'
              AND EXISTS (
                SELECT 1 FROM pg_stat_activity middle
                WHERE ${pid}::int = ANY(pg_blocking_pids(middle.pid))
                  AND middle.pid = ANY(pg_blocking_pids(waiter.pid)))`;
    return (row?.waiting ?? 0) >= count;
  }, `${count} backend(s) wait on a lock behind backend ${pid} (depth ${depth})`);
}
