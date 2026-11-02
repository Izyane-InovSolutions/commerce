import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { BoundedLabel } from './histogram';

const DEFAULT_CACHE_MS = 15_000;
// Every collection query is an aggregate over an indexed status column; the
// timeout keeps a slow or locked database from stalling scrapes.
const STATEMENT_TIMEOUT_MS = 2_000;
const MAX_TYPE_LABELS = 100;

export type QueueGauge = {
  /** Job type or outbox topic — code-defined, bounded. */
  name: string;
  status: string;
  count: number;
  /** Rows that already failed at least once and are waiting to retry. */
  retrying: number;
  /** Age of the oldest row that is due now but not yet started; null if none. */
  oldestDueAgeSeconds: number | null;
};

export type StatusGauge = {
  status: string;
  count: number;
  oldestAgeSeconds: number | null;
};

export type DatabaseGauges = {
  connectionsByState: Record<string, number>;
  maxConnections: number | null;
  /** Sessions in this database currently waiting on a lock. */
  lockWaitingSessions: number;
  /** Lock requests not yet granted, cluster-wide. */
  ungrantedLocks: number;
  longestTransactionSeconds: number | null;
};

export type PoolGauges = {
  open: number | null;
  busy: number | null;
  idle: number | null;
  /** Queries waiting for a pool connection right now. */
  waiting: number | null;
  waitedTotal: number | null;
};

export type OperationalGauges = {
  collectedAt: string;
  collectionMs: number;
  /** Set when any query failed; the rest of the snapshot is still reported. */
  error: string | null;
  jobs: QueueGauge[];
  /** RUNNING jobs whose lock is older than the claim lease (5 minutes). */
  staleRunningJobs: number;
  outbox: QueueGauge[];
  payments: StatusGauge[];
  refundCases: StatusGauge[];
  refunds: StatusGauge[];
  emailDeliveries: StatusGauge[];
  database: DatabaseGauges | null;
  pool: PoolGauges | null;
};

type QueueRow = {
  name: string;
  status: string;
  count: number;
  retrying: number;
  oldest_due_age: number | null;
};
type StatusRow = { status: string; count: number; oldest_age: number | null };
type ActivityRow = { state: string | null; count: number };
type LockRow = {
  lock_waiting: number;
  ungranted: number;
  longest_tx: number | null;
  max_connections: number | null;
};

/**
 * Point-in-time gauges that only the database knows: queue depth and age,
 * retry/dead-letter backlog, unresolved money movements, and lock/connection
 * pressure. Results are cached briefly so frequent scrapes or several
 * scrapers cost one round of aggregate queries, and concurrent callers share
 * the in-flight collection.
 */
@Injectable()
export class OperationalMetricsCollector {
  private readonly logger = new Logger(OperationalMetricsCollector.name);
  private readonly jobTypeLabel = new BoundedLabel(MAX_TYPE_LABELS);
  private readonly topicLabel = new BoundedLabel(MAX_TYPE_LABELS);
  private cached?: { at: number; value: OperationalGauges };
  private inFlight?: Promise<OperationalGauges>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async collect(): Promise<OperationalGauges> {
    const cacheMs = Number(
      this.config.get('METRICS_DB_CACHE_MS', DEFAULT_CACHE_MS),
    );
    if (this.cached && Date.now() - this.cached.at < cacheMs)
      return this.cached.value;
    this.inFlight ??= this.collectNow().finally(() => {
      this.inFlight = undefined;
    });
    const value = await this.inFlight;
    this.cached = { at: Date.now(), value };
    return value;
  }

  private async collectNow(): Promise<OperationalGauges> {
    const startedAt = performance.now();
    const gauges: OperationalGauges = {
      collectedAt: new Date().toISOString(),
      collectionMs: 0,
      error: null,
      jobs: [],
      staleRunningJobs: 0,
      outbox: [],
      payments: [],
      refundCases: [],
      refunds: [],
      emailDeliveries: [],
      database: null,
      pool: null,
    };

    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`,
          );
          const jobs = await tx.$queryRaw<QueueRow[]>`
            SELECT type AS name, status::text AS status, count(*)::int AS count,
              (count(*) FILTER (WHERE attempts > 0 AND status = 'PENDING'))::int AS retrying,
              EXTRACT(EPOCH FROM now() - min(run_at) FILTER (
                WHERE status = 'PENDING' AND run_at <= now()))::float8 AS oldest_due_age
            FROM background_jobs
            WHERE status IN ('PENDING', 'RUNNING', 'DEAD_LETTER')
            GROUP BY type, status`;
          gauges.jobs = queueGauges(jobs, this.jobTypeLabel);

          const [stale] = await tx.$queryRaw<{ count: number }[]>`
            SELECT count(*)::int AS count FROM background_jobs
            WHERE status = 'RUNNING' AND locked_at <= now() - interval '5 minutes'`;
          gauges.staleRunningJobs = stale?.count ?? 0;

          const outbox = await tx.$queryRaw<QueueRow[]>`
            SELECT topic AS name, status::text AS status, count(*)::int AS count,
              (count(*) FILTER (WHERE attempts > 0 AND status = 'PENDING'))::int AS retrying,
              EXTRACT(EPOCH FROM now() - min(available_at) FILTER (
                WHERE status = 'PENDING' AND available_at <= now()))::float8 AS oldest_due_age
            FROM outbox_events
            WHERE status IN ('PENDING', 'DEAD_LETTER')
            GROUP BY topic, status`;
          gauges.outbox = queueGauges(outbox, this.topicLabel);

          gauges.payments = (
            await tx.$queryRaw<StatusRow[]>`
              SELECT status::text AS status, count(*)::int AS count,
                EXTRACT(EPOCH FROM now() - min(created_at))::float8 AS oldest_age
              FROM payments
              WHERE status IN ('PENDING', 'REQUIRES_ACTION', 'PROCESSING')
              GROUP BY status`
          ).map(statusGauge);

          gauges.refundCases = (
            await tx.$queryRaw<StatusRow[]>`
              SELECT status::text AS status, count(*)::int AS count,
                EXTRACT(EPOCH FROM now() - min(created_at))::float8 AS oldest_age
              FROM refund_cases
              WHERE status IN ('PENDING', 'PROCESSING', 'FAILED', 'RECONCILIATION_REQUIRED')
              GROUP BY status`
          ).map(statusGauge);

          gauges.refunds = (
            await tx.$queryRaw<StatusRow[]>`
              SELECT status::text AS status, count(*)::int AS count,
                EXTRACT(EPOCH FROM now() - min(created_at))::float8 AS oldest_age
              FROM refunds
              WHERE status IN ('PENDING', 'PROCESSING')
              GROUP BY status`
          ).map(statusGauge);

          gauges.emailDeliveries = (
            await tx.$queryRaw<StatusRow[]>`
              SELECT status::text AS status, count(*)::int AS count,
                EXTRACT(EPOCH FROM now() - min(created_at))::float8 AS oldest_age
              FROM email_deliveries
              WHERE status IN ('PENDING', 'FAILED')
              GROUP BY status`
          ).map(statusGauge);

          // Without pg_read_all_stats, other roles' sessions show a null
          // state; they are still counted, under "unknown".
          const activity = await tx.$queryRaw<ActivityRow[]>`
            SELECT state, count(*)::int AS count FROM pg_stat_activity
            WHERE datname = current_database() AND backend_type = 'client backend'
            GROUP BY state`;
          const [locks] = await tx.$queryRaw<LockRow[]>`
            SELECT
              (SELECT count(*)::int FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock') AS lock_waiting,
              (SELECT count(*)::int FROM pg_locks WHERE NOT granted) AS ungranted,
              (SELECT EXTRACT(EPOCH FROM max(now() - xact_start))::float8 FROM pg_stat_activity
                WHERE datname = current_database() AND state <> 'idle'
                  AND backend_type = 'client backend' AND pid <> pg_backend_pid()) AS longest_tx,
              current_setting('max_connections')::int AS max_connections`;
          gauges.database = {
            connectionsByState: Object.fromEntries(
              activity.map((row) => [
                (row.state ?? 'unknown').replace(/\s+/g, '_'),
                row.count,
              ]),
            ),
            maxConnections: locks?.max_connections ?? null,
            lockWaitingSessions: locks?.lock_waiting ?? 0,
            ungrantedLocks: locks?.ungranted ?? 0,
            longestTransactionSeconds: roundOrNull(locks?.longest_tx ?? null),
          };
        },
        { maxWait: STATEMENT_TIMEOUT_MS, timeout: STATEMENT_TIMEOUT_MS * 4 },
      );
    } catch (error) {
      gauges.error = describe(error);
      this.logger.warn(
        `Operational metrics collection failed: ${gauges.error}`,
      );
    }

    gauges.pool = await this.poolGauges();
    gauges.collectionMs = Math.round(performance.now() - startedAt);
    return gauges;
  }

  private async poolGauges(): Promise<PoolGauges | null> {
    const client = this.prisma as unknown as {
      $metrics?: { json(): Promise<Prisma.Metrics> };
    };
    if (!client.$metrics) return null;
    try {
      const metrics = await client.$metrics.json();
      const value = (key: string): number | null =>
        [...metrics.gauges, ...metrics.counters].find(
          (metric) => metric.key === key,
        )?.value ?? null;
      const waits = metrics.histograms.find(
        (metric) => metric.key === 'prisma_client_queries_wait_histogram_ms',
      );
      return {
        open: value('prisma_pool_connections_open'),
        busy: value('prisma_pool_connections_busy'),
        idle: value('prisma_pool_connections_idle'),
        waiting: value('prisma_client_queries_wait'),
        waitedTotal: waits?.value.count ?? null,
      };
    } catch {
      return null;
    }
  }
}

// Rows whose names overflow the label cap merge into one `other` series, so
// the output never repeats a label set.
function queueGauges(rows: QueueRow[], label: BoundedLabel): QueueGauge[] {
  const merged = new Map<string, QueueGauge>();
  for (const row of rows) {
    const name = label.normalize(row.name);
    const key = `${name}\u0000${row.status}`;
    const age = roundOrNull(row.oldest_due_age);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        name,
        status: row.status,
        count: row.count,
        retrying: row.retrying,
        oldestDueAgeSeconds: age,
      });
      continue;
    }
    existing.count += row.count;
    existing.retrying += row.retrying;
    if (age !== null)
      existing.oldestDueAgeSeconds = Math.max(
        existing.oldestDueAgeSeconds ?? 0,
        age,
      );
  }
  return [...merged.values()];
}

function statusGauge(row: StatusRow): StatusGauge {
  return {
    status: row.status,
    count: row.count,
    oldestAgeSeconds: roundOrNull(row.oldest_age),
  };
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1_000) / 1_000;
}

// Database errors can quote SQL; keep only the first line, bounded.
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Prisma messages start with a blank line; keep the first non-empty one.
  const line = message.split('\n').find((part) => part.trim()) ?? '';
  return line.trim().slice(0, 200);
}
