import { Injectable } from '@nestjs/common';

type RequestMetric = {
  method: string;
  route: string;
  statusCode: number;
  count: number;
  errorCount: number;
  totalDurationMs: number;
};

export type MetricsSnapshot = {
  uptimeSeconds: number;
  requests: RequestMetric[];
};

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly requests = new Map<string, RequestMetric>();

  recordRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const key = `${method}:${route}:${statusCode}`;
    const metric = this.requests.get(key) ?? {
      method,
      route,
      statusCode,
      count: 0,
      errorCount: 0,
      totalDurationMs: 0,
    };

    metric.count += 1;
    metric.errorCount += statusCode >= 500 ? 1 : 0;
    metric.totalDurationMs += durationMs;
    this.requests.set(key, metric);
  }

  snapshot(): MetricsSnapshot {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1_000),
      requests: [...this.requests.values()].map((metric) => ({ ...metric })),
    };
  }
}
