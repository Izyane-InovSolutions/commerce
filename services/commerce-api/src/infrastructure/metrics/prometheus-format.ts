import type { Histogram } from './histogram';
import type { MetricSeries, ProcessMetrics } from './metrics.service';
import type {
  OperationalGauges,
  QueueGauge,
  StatusGauge,
} from './operational-metrics.collector';

type Labels = Record<string, string>;

/** Prometheus text exposition format 0.0.4. */
export const PROMETHEUS_CONTENT_TYPE =
  'text/plain; version=0.0.4; charset=utf-8';

class Exposition {
  private readonly lines: string[] = [];

  family(name: string, type: string, help: string): this {
    this.lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    return this;
  }

  sample(name: string, value: number | null, labels: Labels = {}): this {
    if (value === null || !Number.isFinite(value)) return this;
    this.lines.push(`${name}${formatLabels(labels)} ${value}`);
    return this;
  }

  histogram(name: string, histogram: Histogram, labels: Labels): this {
    const snapshot = histogram.snapshot();
    for (const bucket of snapshot.buckets)
      this.sample(`${name}_bucket`, bucket.count, {
        ...labels,
        le: String(bucket.le),
      });
    this.sample(`${name}_sum`, snapshot.sumSeconds, labels);
    this.sample(`${name}_count`, snapshot.count, labels);
    return this;
  }

  toString(): string {
    return `${this.lines.join('\n')}\n`;
  }
}

export function renderPrometheus(
  series: MetricSeries,
  process: ProcessMetrics,
  gauges: OperationalGauges,
): string {
  const out = new Exposition();

  out.family(
    'commerce_http_requests_total',
    'counter',
    'HTTP responses by method, route template and status code.',
  );
  for (const route of series.routes)
    for (const [status, count] of route.statusCounts)
      out.sample('commerce_http_requests_total', count, {
        method: route.method,
        route: route.route,
        status: String(status),
      });

  out.family(
    'commerce_http_request_duration_seconds',
    'histogram',
    'HTTP request latency by method and route template.',
  );
  for (const route of series.routes)
    out.histogram('commerce_http_request_duration_seconds', route.duration, {
      method: route.method,
      route: route.route,
    });

  out
    .family(
      'commerce_http_requests_in_flight',
      'gauge',
      'Requests currently being served by this process.',
    )
    .sample('commerce_http_requests_in_flight', series.activeRequests);

  out
    .family('commerce_process_uptime_seconds', 'gauge', 'Process uptime.')
    .sample('commerce_process_uptime_seconds', process.uptimeSeconds)
    .family(
      'commerce_process_resident_memory_bytes',
      'gauge',
      'Resident set size.',
    )
    .sample('commerce_process_resident_memory_bytes', process.rssBytes)
    .family('commerce_process_heap_bytes', 'gauge', 'V8 heap usage.')
    .sample('commerce_process_heap_bytes', process.heapUsedBytes, {
      kind: 'used',
    })
    .sample('commerce_process_heap_bytes', process.heapTotalBytes, {
      kind: 'total',
    })
    .family(
      'commerce_process_external_memory_bytes',
      'gauge',
      'Memory held by C++ objects bound to JavaScript, including buffers.',
    )
    .sample('commerce_process_external_memory_bytes', process.externalBytes)
    .family(
      'commerce_process_cpu_seconds_total',
      'counter',
      'CPU time consumed by this process.',
    )
    .sample('commerce_process_cpu_seconds_total', process.cpuUserSeconds, {
      mode: 'user',
    })
    .sample('commerce_process_cpu_seconds_total', process.cpuSystemSeconds, {
      mode: 'system',
    });

  const loop = process.eventLoopDelay;
  out.family(
    'commerce_event_loop_delay_seconds',
    'gauge',
    `Event-loop delay over the last ${loop.windowSeconds}s window.`,
  );
  for (const [quantile, ms] of [
    ['0.5', loop.p50Ms],
    ['0.9', loop.p90Ms],
    ['0.99', loop.p99Ms],
    ['1', loop.maxMs],
  ] as const)
    out.sample('commerce_event_loop_delay_seconds', seconds(ms), { quantile });

  out.family(
    'commerce_jobs_processed_total',
    'counter',
    'Background job attempts finished by this process, by outcome.',
  );
  for (const job of series.jobs)
    for (const [outcome, count] of Object.entries(job.outcomes))
      out.sample('commerce_jobs_processed_total', count, {
        type: job.type,
        outcome,
      });
  out.family(
    'commerce_job_duration_seconds',
    'histogram',
    'Background job handler duration.',
  );
  for (const job of series.jobs)
    out.histogram('commerce_job_duration_seconds', job.duration, {
      type: job.type,
    });
  out.family(
    'commerce_job_start_lag_seconds',
    'histogram',
    'Delay from a job becoming due (run_at) to a worker starting it.',
  );
  for (const job of series.jobs)
    out.histogram('commerce_job_start_lag_seconds', job.startLag, {
      type: job.type,
    });

  out.family(
    'commerce_outbox_events_processed_total',
    'counter',
    'Outbox dispatch attempts finished by this process, by outcome.',
  );
  for (const topic of series.outbox)
    for (const [outcome, count] of Object.entries(topic.outcomes))
      out.sample('commerce_outbox_events_processed_total', count, {
        topic: topic.topic,
        outcome,
      });
  out.family(
    'commerce_outbox_dispatch_lag_seconds',
    'histogram',
    'Delay from an outbox event being recorded to its first dispatch.',
  );
  for (const topic of series.outbox)
    out.histogram('commerce_outbox_dispatch_lag_seconds', topic.lag, {
      topic: topic.topic,
    });

  renderOperationalGauges(out, gauges);
  return out.toString();
}

function renderOperationalGauges(
  out: Exposition,
  gauges: OperationalGauges,
): void {
  out
    .family(
      'commerce_metrics_collection_success',
      'gauge',
      '1 when the last database gauge collection succeeded.',
    )
    .sample('commerce_metrics_collection_success', gauges.error ? 0 : 1)
    .family(
      'commerce_metrics_collection_duration_seconds',
      'gauge',
      'Duration of the last database gauge collection.',
    )
    .sample(
      'commerce_metrics_collection_duration_seconds',
      gauges.collectionMs / 1_000,
    );

  renderQueue(out, 'commerce_background_jobs', 'type', gauges.jobs);
  out
    .family(
      'commerce_background_jobs_stale_running',
      'gauge',
      'RUNNING jobs whose claim is older than the 5-minute lease.',
    )
    .sample('commerce_background_jobs_stale_running', gauges.staleRunningJobs);
  renderQueue(out, 'commerce_outbox_events', 'topic', gauges.outbox);

  renderStatus(
    out,
    'commerce_payments_unresolved',
    'Payments not yet in a terminal state.',
    gauges.payments,
  );
  renderStatus(
    out,
    'commerce_refund_cases_unresolved',
    'Refund cases pending, processing, failed or awaiting reconciliation.',
    gauges.refundCases,
  );
  renderStatus(
    out,
    'commerce_refunds_unresolved',
    'Refund attempts pending or processing.',
    gauges.refunds,
  );
  renderStatus(
    out,
    'commerce_email_deliveries_unsent',
    'Email deliveries pending or failed.',
    gauges.emailDeliveries,
  );

  const db = gauges.database;
  if (db) {
    out.family(
      'commerce_db_connections',
      'gauge',
      'Client connections to this database by state (all clients).',
    );
    for (const [state, count] of Object.entries(db.connectionsByState))
      out.sample('commerce_db_connections', count, { state });
    out
      .family(
        'commerce_db_max_connections',
        'gauge',
        'PostgreSQL max_connections.',
      )
      .sample('commerce_db_max_connections', db.maxConnections)
      .family(
        'commerce_db_lock_waiting_sessions',
        'gauge',
        'Sessions in this database waiting on a lock.',
      )
      .sample('commerce_db_lock_waiting_sessions', db.lockWaitingSessions)
      .family(
        'commerce_db_ungranted_locks',
        'gauge',
        'Lock requests not yet granted, cluster-wide.',
      )
      .sample('commerce_db_ungranted_locks', db.ungrantedLocks)
      .family(
        'commerce_db_longest_transaction_seconds',
        'gauge',
        'Age of the oldest open non-idle transaction in this database.',
      )
      .sample(
        'commerce_db_longest_transaction_seconds',
        db.longestTransactionSeconds ?? 0,
      );
  }

  const pool = gauges.pool;
  if (pool) {
    out.family(
      'commerce_prisma_pool_connections',
      'gauge',
      "This process's Prisma connection pool by state.",
    );
    for (const [state, value] of [
      ['open', pool.open],
      ['busy', pool.busy],
      ['idle', pool.idle],
    ] as const)
      out.sample('commerce_prisma_pool_connections', value, { state });
    out
      .family(
        'commerce_prisma_queries_waiting',
        'gauge',
        'Queries waiting for a pool connection.',
      )
      .sample('commerce_prisma_queries_waiting', pool.waiting)
      .family(
        'commerce_prisma_pool_waits_total',
        'counter',
        'Queries that had to wait for a pool connection.',
      )
      .sample('commerce_prisma_pool_waits_total', pool.waitedTotal);
  }
}

function renderQueue(
  out: Exposition,
  prefix: string,
  nameLabel: string,
  rows: QueueGauge[],
): void {
  out.family(prefix, 'gauge', `Rows by ${nameLabel} and open status.`);
  for (const row of rows)
    out.sample(prefix, row.count, {
      [nameLabel]: row.name,
      status: row.status,
    });
  out.family(
    `${prefix}_retrying`,
    'gauge',
    'PENDING rows that already failed at least once.',
  );
  for (const row of rows)
    if (row.status === 'PENDING')
      out.sample(`${prefix}_retrying`, row.retrying, {
        [nameLabel]: row.name,
      });
  out.family(
    `${prefix}_oldest_due_age_seconds`,
    'gauge',
    'Age of the oldest PENDING row that is due but not started.',
  );
  for (const row of rows)
    if (row.status === 'PENDING')
      out.sample(
        `${prefix}_oldest_due_age_seconds`,
        row.oldestDueAgeSeconds ?? 0,
        { [nameLabel]: row.name },
      );
}

function renderStatus(
  out: Exposition,
  name: string,
  help: string,
  rows: StatusGauge[],
): void {
  out.family(name, 'gauge', help);
  for (const row of rows) out.sample(name, row.count, { status: row.status });
  out.family(
    `${name}_oldest_age_seconds`,
    'gauge',
    'Age of the oldest row in each status.',
  );
  for (const row of rows)
    out.sample(`${name}_oldest_age_seconds`, row.oldestAgeSeconds, {
      status: row.status,
    });
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',')}}`;
}

function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function seconds(ms: number | null): number | null {
  return ms === null ? null : ms / 1_000;
}
