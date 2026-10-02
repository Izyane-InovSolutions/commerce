import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { CLIENT_CLOSED_REQUEST, MetricsService } from './metrics.service';

/**
 * Times every request from arrival to the response finishing.
 *
 * A middleware rather than an interceptor: interceptors run after guards and
 * routing, so they never see 401/403/429 guard rejections, unmatched routes
 * or body-parser failures — exactly the responses an error rate must count.
 *
 * The route label is Express's matched template (`/api/v1/orders/:id`), read
 * once the response is done. Unmatched requests are labelled `unmatched`; the
 * raw URL, which can carry IDs and tokens, is never recorded.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = performance.now();
    let recorded = false;
    this.metrics.requestStarted();

    const record = (statusCode: number): void => {
      if (recorded) return;
      recorded = true;
      this.metrics.requestFinished();
      this.metrics.recordRequest(
        req.method,
        routeTemplate(req),
        statusCode,
        performance.now() - startedAt,
      );
    };

    res.once('finish', () => record(res.statusCode));
    // `close` without `finish` means the client went away first.
    res.once('close', () => record(CLIENT_CLOSED_REQUEST));
    next();
  }
}

// Nest mounts `forRoutes('{*path}')` middleware (RequestIdMiddleware) as an
// Express route, so a request no controller matched still carries that
// catch-all as req.route. No controller route uses a wildcard.
const MIDDLEWARE_CATCH_ALL = '{*path}';

export function routeTemplate(req: Request): string | undefined {
  const path: unknown = (req as unknown as { route?: { path?: unknown } }).route
    ?.path;
  return typeof path === 'string' && !path.includes(MIDDLEWARE_CATCH_ALL)
    ? path
    : undefined;
}
