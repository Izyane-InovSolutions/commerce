import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

import {
  BoundedLabel,
  DURATION_BUCKETS_SECONDS,
  Histogram,
  LAG_BUCKETS_SECONDS,
} from './histogram';

/** Label used when a request matched no route; the raw path is never kept. */
export const UNMATCHED_ROUTE = 'unmatched';

/** Nginx's convention for a client that disconnected before a response. */
export const CLIENT_CLOSED_REQUEST = 499;

const KNOWN_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);

// Route templates are finite (one per controller method, ~300 today), so the
// cap only matters if something feeds a non-template value in.
const MAX_ROUTES = 500;
const MAX_JOB_TYPES = 100;
const MAX_OUTBOX_TOPICS = 100;
const EVENT_LOOP_WINDOW_MS = 60_000;

export type JobOutcome = 'succeeded' | 'failed' | 'dead_letter';
export type OutboxOutcome = 'published' | 'failed' | 'dead_letter';

export type LatencySummary = {
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  meanMs: number | null;
};

export type RouteMetric = {
  method: string;
  route: string;
  count: number;
  /** 5xx responses. */
  errorCount: number;
  /** 4xx responses: validation, auth, throttling, not found, 499 disconnects. */
  clientErrorCount: number;
  statusCounts: Record<string, number>;
  totalDurationMs: number;
  latency: LatencySummary;
};

export type JobMetric = {
  type: string;
  succeeded: number;
  failed: number;
  deadLettered: number;
  duration: LatencySummary;
  startLag: LatencySummary;
};

export type OutboxMetric = {
  topic: string;
  published: number;
  failed: number;
  deadLettered: number;
  dispatchLag: LatencySummary;
};

export type EventLoopDelaySummary = {
  windowSeconds: number;
  p50Ms: number | null;
  p90Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  meanMs: number | null;
};

export type ProcessMetrics = {
  uptimeSeconds: number;
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  cpuUserSeconds: number;
  cpuSystemSeconds: number;
  activeRequests: number;
  eventLoopDelay: EventLoopDelaySummary;
};

export type ProcessMetricsSnapshot = {
  generatedAt: string;
  process: ProcessMetrics;
  requests: RouteMetric[];
  jobs: JobMetric[];
  outbox: OutboxMetric[];
};

type RouteSeries = {
  method: string;
  route: string;
  statusCounts: Map<number, number>;
  duration: Histogram;
};

type JobSeries = {
  type: string;
  outcomes: Record<JobOutcome, number>;
  duration: Histogram;
  startLag: Histogram;
};

type OutboxSeries = {
  topic: string;
  outcomes: Record<OutboxOutcome, number>;
  lag: Histogram;
};

/** Raw series for the Prometheus renderer; see prometheus-format.ts. */
export type MetricSeries = {
  routes: readonly RouteSeries[];
  jobs: readonly JobSeries[];
  outbox: readonly OutboxSeries[];
  activeRequests: number;
};

/**
 * In-process metrics. Per process and reset on restart; a scraper sums
 * replicas. Every label is bounded: route templates (never raw URLs), a fixed
 * set of HTTP methods, numeric status codes and code-defined job types/topics.
 * Nothing user-specific — IDs, tokens, query strings — is ever a label.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly startedAt = Date.now();
  private readonly routes = new Map<string, RouteSeries>();
  private readonly jobs = new Map<string, JobSeries>();
  private readonly outbox = new Map<string, OutboxSeries>();
  private readonly routeLabel = new BoundedLabel(MAX_ROUTES);
  private readonly jobTypeLabel = new BoundedLabel(MAX_JOB_TYPES);
  private readonly topicLabel = new BoundedLabel(MAX_OUTBOX_TOPICS);
  private activeRequests = 0;
  private eventLoop?: IntervalHistogram;
  private eventLoopTimer?: NodeJS.Timeout;
  private lastEventLoopWindow: EventLoopDelaySummary = emptyEventLoopWindow();

  onModuleInit(): void {
    this.eventLoop = monitorEventLoopDelay({ resolution: 20 });
    this.eventLoop.enable();
    this.eventLoopTimer = setInterval(
      () => this.rotateEventLoopWindow(),
      EVENT_LOOP_WINDOW_MS,
    );
    this.eventLoopTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.eventLoopTimer);
    this.eventLoop?.disable();
  }

  requestStarted(): void {
    this.activeRequests += 1;
  }

  requestFinished(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  recordRequest(
    method: string,
    route: string | undefined,
    statusCode: number,
    durationMs: number,
  ): void {
    const methodLabel = KNOWN_METHODS.has(method) ? method : 'OTHER';
    const routeLabel = this.routeLabel.normalize(route ?? UNMATCHED_ROUTE);
    const key = `${methodLabel} ${routeLabel}`;
    let series = this.routes.get(key);
    if (!series) {
      series = {
        method: methodLabel,
        route: routeLabel,
        statusCounts: new Map(),
        duration: new Histogram(DURATION_BUCKETS_SECONDS),
      };
      this.routes.set(key, series);
    }
    const status =
      Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
        ? statusCode
        : 500;
    series.statusCounts.set(status, (series.statusCounts.get(status) ?? 0) + 1);
    series.duration.observe(durationMs / 1_000);
  }

  recordJob(
    type: string,
    outcome: JobOutcome,
    durationMs: number,
    startLagMs: number | null,
  ): void {
    const label = this.jobTypeLabel.normalize(type);
    let series = this.jobs.get(label);
    if (!series) {
      series = {
        type: label,
        outcomes: { succeeded: 0, failed: 0, dead_letter: 0 },
        duration: new Histogram(DURATION_BUCKETS_SECONDS),
        startLag: new Histogram(LAG_BUCKETS_SECONDS),
      };
      this.jobs.set(label, series);
    }
    series.outcomes[outcome] += 1;
    series.duration.observe(durationMs / 1_000);
    if (startLagMs !== null) series.startLag.observe(startLagMs / 1_000);
  }

  recordOutboxEvent(
    topic: string,
    outcome: OutboxOutcome,
    dispatchLagMs: number | null,
  ): void {
    const label = this.topicLabel.normalize(topic);
    let series = this.outbox.get(label);
    if (!series) {
      series = {
        topic: label,
        outcomes: { published: 0, failed: 0, dead_letter: 0 },
        lag: new Histogram(LAG_BUCKETS_SECONDS),
      };
      this.outbox.set(label, series);
    }
    series.outcomes[outcome] += 1;
    if (dispatchLagMs !== null) series.lag.observe(dispatchLagMs / 1_000);
  }

  series(): MetricSeries {
    return {
      routes: [...this.routes.values()],
      jobs: [...this.jobs.values()],
      outbox: [...this.outbox.values()],
      activeRequests: this.activeRequests,
    };
  }

  processMetrics(): ProcessMetrics {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1_000),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      cpuUserSeconds: cpu.user / 1e6,
      cpuSystemSeconds: cpu.system / 1e6,
      activeRequests: this.activeRequests,
      eventLoopDelay: this.eventLoopDelay(),
    };
  }

  snapshot(): ProcessMetricsSnapshot {
    return {
      generatedAt: new Date().toISOString(),
      process: this.processMetrics(),
      requests: [...this.routes.values()].map((series) => {
        let errorCount = 0;
        let clientErrorCount = 0;
        const statusCounts: Record<string, number> = {};
        for (const [status, count] of series.statusCounts) {
          statusCounts[String(status)] = count;
          if (status >= 500) errorCount += count;
          else if (status >= 400) clientErrorCount += count;
        }
        return {
          method: series.method,
          route: series.route,
          count: series.duration.count,
          errorCount,
          clientErrorCount,
          statusCounts,
          totalDurationMs: round(series.duration.sumSeconds * 1_000),
          latency: summarize(series.duration),
        };
      }),
      jobs: [...this.jobs.values()].map((series) => ({
        type: series.type,
        succeeded: series.outcomes.succeeded,
        failed: series.outcomes.failed,
        deadLettered: series.outcomes.dead_letter,
        duration: summarize(series.duration),
        startLag: summarize(series.startLag),
      })),
      outbox: [...this.outbox.values()].map((series) => ({
        topic: series.topic,
        published: series.outcomes.published,
        failed: series.outcomes.failed,
        deadLettered: series.outcomes.dead_letter,
        dispatchLag: summarize(series.lag),
      })),
    };
  }

  /**
   * The last complete window, or the current partial one before the first
   * window closes. Fixed windows keep two readers (JSON and Prometheus) from
   * resetting each other's view.
   */
  private eventLoopDelay(): EventLoopDelaySummary {
    if (this.lastEventLoopWindow.windowSeconds > 0 || !this.eventLoop)
      return this.lastEventLoopWindow;
    return summarizeEventLoop(
      this.eventLoop,
      (Date.now() - this.startedAt) / 1_000,
    );
  }

  private rotateEventLoopWindow(): void {
    if (!this.eventLoop) return;
    this.lastEventLoopWindow = summarizeEventLoop(
      this.eventLoop,
      EVENT_LOOP_WINDOW_MS / 1_000,
    );
    this.eventLoop.reset();
  }
}

function summarize(histogram: Histogram): LatencySummary {
  const toMs = (seconds: number | null): number | null =>
    seconds === null ? null : round(seconds * 1_000);
  return {
    p50Ms: toMs(histogram.quantile(0.5)),
    p95Ms: toMs(histogram.quantile(0.95)),
    p99Ms: toMs(histogram.quantile(0.99)),
    meanMs:
      histogram.count === 0
        ? null
        : round((histogram.sumSeconds * 1_000) / histogram.count),
  };
}

function summarizeEventLoop(
  histogram: IntervalHistogram,
  windowSeconds: number,
): EventLoopDelaySummary {
  if (histogram.count === 0)
    return { ...emptyEventLoopWindow(), windowSeconds: round(windowSeconds) };
  const toMs = (nanoseconds: number): number => round(nanoseconds / 1e6);
  return {
    windowSeconds: round(windowSeconds),
    p50Ms: toMs(histogram.percentile(50)),
    p90Ms: toMs(histogram.percentile(90)),
    p99Ms: toMs(histogram.percentile(99)),
    maxMs: toMs(histogram.max),
    meanMs: toMs(histogram.mean),
  };
}

function emptyEventLoopWindow(): EventLoopDelaySummary {
  return {
    windowSeconds: 0,
    p50Ms: null,
    p90Ms: null,
    p99Ms: null,
    maxMs: null,
    meanMs: null,
  };
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
