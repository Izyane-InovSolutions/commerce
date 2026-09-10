import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';

type SuccessBody = { data: unknown; meta: { requestId: string } };
type ErrorBody = { error: { code: string }; requestId: string };

describe('Commerce API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: () => Promise.resolve(),
        $disconnect: () => Promise.resolve(),
      })
      .overrideProvider(PrismaHealthIndicator)
      .useValue({
        pingCheck: () => Promise.resolve({ database: { status: 'up' } }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/health')
      .expect(200);
    const body = response.body as SuccessBody;

    expect(body.data).toEqual({ status: 'ok' });
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/v1/health/ready', async () => {
    await request(app.getHttpServer() as Server)
      .get('/api/v1/health/ready')
      .expect(200);
  });

  it('returns a structured error envelope for unknown routes', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/api/v1/does-not-exist')
      .expect(404);
    const body = response.body as ErrorBody;

    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.requestId).toEqual(expect.any(String));
  });
});
