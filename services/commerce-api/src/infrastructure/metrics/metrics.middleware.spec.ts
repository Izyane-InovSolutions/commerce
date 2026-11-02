import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';

import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';

function exchange(route?: string): {
  req: Request;
  res: Response & EventEmitter;
} {
  const req = {
    method: 'GET',
    url: '/api/v1/orders/2f1c?token=abc',
    route: route ? { path: route } : undefined,
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
  }) as unknown as Response & EventEmitter;
  return { req, res };
}

describe('MetricsMiddleware', () => {
  let metrics: MetricsService;
  let middleware: MetricsMiddleware;

  beforeEach(() => {
    metrics = new MetricsService();
    middleware = new MetricsMiddleware(metrics);
  });

  it('records the route template and final status once the response finishes', () => {
    const { req, res } = exchange('/api/v1/orders/:id');
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(metrics.processMetrics().activeRequests).toBe(1);

    res.statusCode = 403;
    res.emit('finish');
    res.emit('close');

    expect(metrics.processMetrics().activeRequests).toBe(0);
    expect(metrics.snapshot().requests).toEqual([
      expect.objectContaining({
        route: '/api/v1/orders/:id',
        count: 1,
        statusCounts: { '403': 1 },
      }),
    ]);
  });

  it('labels requests without a matched route as unmatched, never the URL', () => {
    const { req, res } = exchange();
    middleware.use(req, res, jest.fn());
    res.statusCode = 404;
    res.emit('finish');

    const serialized = JSON.stringify(metrics.snapshot());
    expect(serialized).toContain('"route":"unmatched"');
    expect(serialized).not.toContain('2f1c');
    expect(serialized).not.toContain('token');
  });

  it("treats the request-id middleware's catch-all route as unmatched", () => {
    const { req, res } = exchange('/api/v1/{*path}');
    middleware.use(req, res, jest.fn());
    res.statusCode = 404;
    res.emit('finish');

    expect(metrics.snapshot().requests[0]?.route).toBe('unmatched');
  });

  it('records a client disconnect before the response as 499', () => {
    const { req, res } = exchange('/api/v1/products');
    middleware.use(req, res, jest.fn());
    res.emit('close');

    expect(metrics.snapshot().requests[0]?.statusCounts).toEqual({ '499': 1 });
  });
});
