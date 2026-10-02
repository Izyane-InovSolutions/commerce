import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { json } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { MetricsMiddleware } from '../src/infrastructure/metrics/metrics.middleware';
import { FakePrismaService } from './support/fake-prisma.service';
import { issueTestToken } from './support/issue-test-token';

const SCRAPE_TOKEN = 'e2e-metrics-scrape-token-0123456789abcdef';
const RESOURCE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('Metrics access and labels (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    prisma = new FakePrismaService();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    // Mounted first, as in main.ts.
    const metrics = app.get(MetricsMiddleware);
    app.use(metrics.use.bind(metrics));
    app.use(json({ limit: '1kb' }));
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
        exceptionFactory: (errors: ValidationError[]): ValidationException =>
          new ValidationException(errors),
      }),
    );
    await app.init();
    jwt = app.get(JwtService);
  });

  afterEach(() => {
    delete process.env.METRICS_SCRAPE_TOKEN;
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): Server => app.getHttpServer() as Server;

  it('restricts the JSON snapshot to administrators', async () => {
    await request(server()).get('/api/v1/metrics').expect(401);

    const customer = await issueTestToken(
      jwt,
      prisma,
      '00000000-0000-4000-8000-0000000000c1',
      'CUSTOMER',
    );
    await request(server())
      .get('/api/v1/metrics')
      .set('authorization', `Bearer ${customer}`)
      .expect(403);

    const admin = await issueTestToken(
      jwt,
      prisma,
      '00000000-0000-4000-8000-0000000000a1',
      'ADMIN',
    );
    const response = await request(server())
      .get('/api/v1/metrics')
      .set('authorization', `Bearer ${admin}`)
      .expect(200);
    const data = (
      response.body as {
        data: {
          process: { rssBytes: number };
          requests: unknown[];
          operational: unknown;
        };
      }
    ).data;
    expect(data.process.rssBytes).toBeGreaterThan(0);
    expect(Array.isArray(data.requests)).toBe(true);
    expect(data.operational).toBeDefined();
  });

  it('hides the Prometheus route unless a scrape token is configured', async () => {
    await request(server())
      .get('/api/v1/metrics/prometheus')
      .set('authorization', `Bearer ${SCRAPE_TOKEN}`)
      .expect(404);
  });

  it('admits only the configured scraper, even over an admin session', async () => {
    process.env.METRICS_SCRAPE_TOKEN = SCRAPE_TOKEN;
    const admin = await issueTestToken(
      jwt,
      prisma,
      '00000000-0000-4000-8000-0000000000a2',
      'ADMIN',
    );

    await request(server()).get('/api/v1/metrics/prometheus').expect(401);
    await request(server())
      .get('/api/v1/metrics/prometheus')
      .set('authorization', 'Bearer wrong-token')
      .expect(401);
    await request(server())
      .get('/api/v1/metrics/prometheus')
      .set('authorization', `Bearer ${admin}`)
      .expect(401);

    const response = await request(server())
      .get('/api/v1/metrics/prometheus')
      .set('authorization', `Bearer ${SCRAPE_TOKEN}`)
      .expect(200);
    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.text).toContain(
      '# TYPE commerce_http_requests_total counter',
    );
  });

  it('labels by route template and counts guard rejections and unmatched routes without raw URLs', async () => {
    process.env.METRICS_SCRAPE_TOKEN = SCRAPE_TOKEN;
    await request(server())
      .get(`/api/v1/admin/catalog/products/${RESOURCE_ID}?token=secret-value`)
      .expect(401);
    await request(server())
      .get(`/api/v1/no-such-route/${RESOURCE_ID}?email=someone@example.test`)
      .expect(404);
    await request(server())
      .post('/api/v1/auth/register')
      .send({ email: `${'a'.repeat(2000)}@example.test`, password: 'x' })
      .expect(413);

    const { text } = await request(server())
      .get('/api/v1/metrics/prometheus')
      .set('authorization', `Bearer ${SCRAPE_TOKEN}`)
      .expect(200);

    expect(text).toContain(
      'commerce_http_requests_total{method="GET",route="/api/v1/admin/catalog/products/:id",status="401"} 1',
    );
    expect(text).toContain(
      'commerce_http_requests_total{method="GET",route="unmatched",status="404"} 1',
    );
    // Body-parser rejections happen before routing.
    expect(text).toContain(
      'commerce_http_requests_total{method="POST",route="unmatched",status="413"} 1',
    );
    expect(text).not.toContain(RESOURCE_ID);
    expect(text).not.toContain('secret-value');
    expect(text).not.toContain('example.test');
  });

  it('keeps liveness public and independent of the database', async () => {
    await request(server())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }: { body: { data: unknown } }) =>
        expect(body.data).toEqual({ status: 'ok' }),
      );
  });
});
