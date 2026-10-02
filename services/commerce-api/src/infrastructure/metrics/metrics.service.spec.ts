import { MetricsService, UNMATCHED_ROUTE } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  afterEach(() => service.onModuleDestroy());

  it('aggregates requests per method and route template with status counts', () => {
    service.recordRequest('GET', '/api/v1/orders/:id', 200, 20);
    service.recordRequest('GET', '/api/v1/orders/:id', 200, 40);
    service.recordRequest('GET', '/api/v1/orders/:id', 404, 5);
    service.recordRequest('GET', '/api/v1/orders/:id', 503, 900);

    const [route] = service.snapshot().requests;
    expect(route).toMatchObject({
      method: 'GET',
      route: '/api/v1/orders/:id',
      count: 4,
      errorCount: 1,
      clientErrorCount: 1,
      statusCounts: { '200': 2, '404': 1, '503': 1 },
      totalDurationMs: 965,
    });
    expect(route?.latency.p50Ms).not.toBeNull();
    expect(route?.latency.p99Ms).toBeGreaterThanOrEqual(
      route?.latency.p50Ms ?? 0,
    );
  });

  it('never keeps a raw path: unmatched requests share one label', () => {
    service.recordRequest('GET', undefined, 404, 1);
    service.recordRequest('GET', undefined, 404, 1);

    expect(service.snapshot().requests).toEqual([
      expect.objectContaining({ route: UNMATCHED_ROUTE, count: 2 }),
    ]);
  });

  it('bounds method and status labels', () => {
    service.recordRequest('PROPFIND', '/x', 200, 1);
    service.recordRequest('GET', '/x', 1234, 1);

    const methods = service.snapshot().requests.map((r) => r.method);
    expect(methods).toEqual(['OTHER', 'GET']);
    expect(service.snapshot().requests[1]?.statusCounts).toEqual({
      '500': 1,
    });
  });

  it('caps the number of distinct route labels', () => {
    for (let i = 0; i < 600; i += 1)
      service.recordRequest('GET', `/generated/${i}`, 200, 1);

    const routes = service.snapshot().requests;
    expect(routes.length).toBeLessThanOrEqual(501);
    expect(routes.find((r) => r.route === 'other')?.count).toBe(100);
  });

  it('records job and outbox outcomes with lag', () => {
    service.recordJob('email.send', 'succeeded', 120, 1_500);
    service.recordJob('email.send', 'dead_letter', 80, 2_000);
    service.recordOutboxEvent('order.paid', 'published', 300);
    service.recordOutboxEvent('order.paid', 'failed', null);

    const snapshot = service.snapshot();
    expect(snapshot.jobs).toEqual([
      expect.objectContaining({
        type: 'email.send',
        succeeded: 1,
        failed: 0,
        deadLettered: 1,
      }),
    ]);
    expect(snapshot.jobs[0]?.startLag.p50Ms).not.toBeNull();
    expect(snapshot.outbox).toEqual([
      expect.objectContaining({ topic: 'order.paid', published: 1, failed: 1 }),
    ]);
  });

  it('tracks in-flight requests and reports process resources', () => {
    service.onModuleInit();
    service.requestStarted();
    service.requestStarted();
    service.requestFinished();

    const process = service.processMetrics();
    expect(process.activeRequests).toBe(1);
    expect(process.rssBytes).toBeGreaterThan(0);
    expect(process.heapUsedBytes).toBeGreaterThan(0);
    expect(process.cpuUserSeconds).toBeGreaterThanOrEqual(0);
    expect(process.eventLoopDelay).toHaveProperty('p99Ms');
  });
});
