import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';

import { AdmissionGuard } from '../src/infrastructure/lifecycle/admission.guard';

@Controller('slow')
class SlowController {
  @Get()
  async slow(): Promise<{ ok: true }> {
    await sleep(300);
    return { ok: true };
  }
}

@Module({
  controllers: [SlowController],
  providers: [
    { provide: ConfigService, useValue: { get: (): number => 1 } },
    { provide: APP_GUARD, useClass: AdmissionGuard },
  ],
})
class AdmissionTestModule {}

describe('admission under concurrent HTTP requests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AdmissionTestModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async (): Promise<void> => {
    await app.close();
  });

  it('responds 503 with Retry-After and accepts work after the first response', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const first = request(server).get('/api/v1/slow');
    const firstResult = first.then((response) => response);
    await sleep(50);
    const rejected = await request(server).get('/api/v1/slow').expect(503);
    expect(rejected.headers['retry-after']).toBe('1');
    await expect(firstResult).resolves.toMatchObject({ status: 200 });
    await request(server).get('/api/v1/slow').expect(200);
  });
});
