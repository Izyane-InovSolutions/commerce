import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../database/prisma.service';
import { OperationalMetricsCollector } from './operational-metrics.collector';

type Tx = { $executeRawUnsafe: jest.Mock; $queryRaw: jest.Mock };

/** Answers the collector's queries in the order it issues them. */
function answers(): unknown[][] {
  return [
    [
      {
        name: 'email.send',
        status: 'PENDING',
        count: 3,
        retrying: 1,
        oldest_due_age: 12.3456,
      },
    ],
    [{ count: 1 }],
    [
      {
        name: 'order.paid',
        status: 'DEAD_LETTER',
        count: 2,
        retrying: 0,
        oldest_due_age: null,
      },
    ],
    [{ status: 'PENDING', count: 4, oldest_age: 600 }],
    [{ status: 'FAILED', count: 1, oldest_age: 30 }],
    [],
    [{ status: 'PENDING', count: 5, oldest_age: 1 }],
    [
      { state: 'active', count: 2 },
      { state: 'idle in transaction', count: 1 },
      { state: null, count: 4 },
    ],
    [
      {
        lock_waiting: 1,
        ungranted: 2,
        longest_tx: 3.5,
        max_connections: 100,
      },
    ],
  ];
}

function setup(options: { fail?: boolean; cacheMs?: number } = {}): {
  collector: OperationalMetricsCollector;
  tx: Tx;
  prisma: { $transaction: jest.Mock; $metrics: { json: jest.Mock } };
} {
  const queue = answers();
  const tx: Tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(() => Promise.resolve(queue.shift() ?? [])),
  };
  const prisma = {
    $transaction: jest.fn(async (run: (tx: Tx) => Promise<void>) => {
      if (options.fail) throw new Error('\ncanceling statement\nSELECT secret');
      await run(tx);
    }),
    $metrics: {
      json: jest.fn().mockResolvedValue({
        counters: [],
        gauges: [
          { key: 'prisma_pool_connections_open', value: 3 },
          { key: 'prisma_pool_connections_busy', value: 1 },
          { key: 'prisma_pool_connections_idle', value: 2 },
          { key: 'prisma_client_queries_wait', value: 0 },
        ],
        histograms: [
          {
            key: 'prisma_client_queries_wait_histogram_ms',
            value: { buckets: [], sum: 10, count: 7 },
          },
        ],
      }),
    },
  };
  const config = {
    get: (_key: string, fallback?: unknown) => options.cacheMs ?? fallback,
  } as unknown as ConfigService;
  return {
    collector: new OperationalMetricsCollector(
      prisma as unknown as PrismaService,
      config,
    ),
    tx,
    prisma,
  };
}

describe('OperationalMetricsCollector', () => {
  it('collects queue, money, database and pool gauges under a statement timeout', async () => {
    const { collector, tx } = setup();

    const gauges = await collector.collect();

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SET LOCAL statement_timeout = 2000',
    );
    expect(gauges.error).toBeNull();
    expect(gauges.jobs).toEqual([
      {
        name: 'email.send',
        status: 'PENDING',
        count: 3,
        retrying: 1,
        oldestDueAgeSeconds: 12.346,
      },
    ]);
    expect(gauges.staleRunningJobs).toBe(1);
    expect(gauges.outbox[0]).toMatchObject({
      name: 'order.paid',
      status: 'DEAD_LETTER',
    });
    expect(gauges.payments).toEqual([
      { status: 'PENDING', count: 4, oldestAgeSeconds: 600 },
    ]);
    expect(gauges.refundCases[0]?.status).toBe('FAILED');
    expect(gauges.emailDeliveries[0]?.count).toBe(5);
    expect(gauges.database).toEqual({
      connectionsByState: { active: 2, idle_in_transaction: 1, unknown: 4 },
      maxConnections: 100,
      lockWaitingSessions: 1,
      ungrantedLocks: 2,
      longestTransactionSeconds: 3.5,
    });
    expect(gauges.pool).toEqual({
      open: 3,
      busy: 1,
      idle: 2,
      waiting: 0,
      waitedTotal: 7,
    });
  });

  it('reuses a recent collection instead of querying again', async () => {
    const { collector, prisma } = setup({ cacheMs: 60_000 });

    await Promise.all([collector.collect(), collector.collect()]);
    await collector.collect();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('reports a failed collection without throwing or leaking SQL', async () => {
    const { collector } = setup({ fail: true });

    const gauges = await collector.collect();

    expect(gauges.error).toBe('canceling statement');
    expect(gauges.jobs).toEqual([]);
    expect(gauges.pool?.open).toBe(3);
  });
});
