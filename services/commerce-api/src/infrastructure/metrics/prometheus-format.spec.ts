import { MetricsService } from './metrics.service';
import type { OperationalGauges } from './operational-metrics.collector';
import { renderPrometheus } from './prometheus-format';

function gauges(overrides: Partial<OperationalGauges> = {}): OperationalGauges {
  return {
    collectedAt: '2026-10-02T00:00:00.000Z',
    collectionMs: 12,
    error: null,
    jobs: [
      {
        name: 'email.send',
        status: 'PENDING',
        count: 3,
        retrying: 1,
        oldestDueAgeSeconds: 42.5,
      },
      {
        name: 'email.send',
        status: 'DEAD_LETTER',
        count: 2,
        retrying: 0,
        oldestDueAgeSeconds: null,
      },
    ],
    staleRunningJobs: 0,
    outbox: [],
    payments: [{ status: 'PENDING', count: 4, oldestAgeSeconds: 600 }],
    refundCases: [
      { status: 'RECONCILIATION_REQUIRED', count: 1, oldestAgeSeconds: 7200 },
    ],
    refunds: [],
    emailDeliveries: [],
    database: {
      connectionsByState: { active: 2, idle: 5 },
      maxConnections: 100,
      lockWaitingSessions: 1,
      ungrantedLocks: 1,
      longestTransactionSeconds: 0.5,
    },
    pool: { open: 3, busy: 1, idle: 2, waiting: 0, waitedTotal: 7 },
    ...overrides,
  };
}

/** Every sample line: name{labels} value. */
const SAMPLE =
  /^[a-z_]+(\{([a-z_]+="([^"\\\n]|\\["\\n])*",?)*\})? -?[0-9.e+-]+$/;

describe('renderPrometheus', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
    metrics.recordRequest('GET', '/api/v1/products/:id', 200, 30);
    metrics.recordRequest('POST', '/api/v1/auth/login', 401, 80);
    metrics.recordRequest('GET', undefined, 404, 1);
    metrics.recordJob('email.send', 'succeeded', 50, 900);
    metrics.recordOutboxEvent('order.paid', 'published', 1200);
  });

  it('renders valid exposition lines with HELP and TYPE for each family', () => {
    const text = renderPrometheus(
      metrics.series(),
      metrics.processMetrics(),
      gauges(),
    );
    const lines = text.trimEnd().split('\n');

    for (const line of lines) {
      if (line.startsWith('# HELP ') || line.startsWith('# TYPE ')) continue;
      expect(line).toMatch(SAMPLE);
    }
    expect(text).toContain(
      'commerce_http_requests_total{method="GET",route="/api/v1/products/:id",status="200"} 1',
    );
    expect(text).toContain(
      'commerce_http_request_duration_seconds_bucket{method="GET",route="/api/v1/products/:id",le="+Inf"} 1',
    );
    expect(text).toContain(
      'commerce_background_jobs{type="email.send",status="DEAD_LETTER"} 2',
    );
    expect(text).toContain(
      'commerce_background_jobs_oldest_due_age_seconds{type="email.send"} 42.5',
    );
    expect(text).toContain(
      'commerce_refund_cases_unresolved{status="RECONCILIATION_REQUIRED"} 1',
    );
    expect(text).toContain('commerce_db_lock_waiting_sessions 1');
    expect(text).toContain('commerce_prisma_pool_connections{state="busy"} 1');
    expect(text).toContain('commerce_metrics_collection_success 1');
    expect(text).toContain(
      'commerce_jobs_processed_total{type="email.send",outcome="succeeded"} 1',
    );
  });

  it('uses only the bounded label names', () => {
    const text = renderPrometheus(
      metrics.series(),
      metrics.processMetrics(),
      gauges(),
    );
    const allowed = new Set([
      'method',
      'route',
      'status',
      'le',
      'kind',
      'mode',
      'quantile',
      'type',
      'outcome',
      'topic',
      'state',
    ]);
    const names = [...text.matchAll(/[{,]([a-z_]+)="/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(allowed).toContain(name);
    // No identifiers or credentials anywhere, including HELP text.
    expect(text).not.toMatch(/token|userId|[0-9a-f]{8}-[0-9a-f]{4}|\?/i);
  });

  it('reports a failed collection and escapes label values', () => {
    metrics.recordRequest('GET', '/odd/"quoted"\\path', 200, 1);
    const text = renderPrometheus(
      metrics.series(),
      metrics.processMetrics(),
      gauges({ error: 'timeout', database: null, pool: null }),
    );

    expect(text).toContain('commerce_metrics_collection_success 0');
    expect(text).toContain('route="/odd/\\"quoted\\"\\\\path"');
    expect(text).not.toContain('commerce_db_connections');
  });
});
