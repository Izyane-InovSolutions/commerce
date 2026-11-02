import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { AppModule } from '../src/app.module';
import { Public } from '../src/common/auth/public.decorator';
import { PrismaService } from '../src/database/prisma.service';
import { shutdownGracefully } from '../src/infrastructure/lifecycle/graceful-shutdown';
import { ShutdownState } from '../src/infrastructure/lifecycle/shutdown-state.service';
import { FakePrismaService } from './support/fake-prisma.service';

const SLOW_REQUEST_MS = 600;
const DRAIN_DELAY_MS = 300;

@Controller('test-slow')
class SlowController {
  @Public()
  @Get()
  async slow(): Promise<{ finished: true }> {
    await sleep(SLOW_REQUEST_MS);
    return { finished: true };
  }
}

@Module({ controllers: [SlowController] })
class SlowModule {}

describe('Graceful shutdown (process)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SlowModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
  });

  it('drains: readiness fails first, in-flight work finishes, then the port closes', async () => {
    const before = await fetch(`${baseUrl}/health`);
    expect(before.status).toBe(200);

    const inFlight = fetch(`${baseUrl}/test-slow`);
    await sleep(50);

    const shutdown = shutdownGracefully(
      app,
      app.get(ShutdownState),
      DRAIN_DELAY_MS,
    );

    // During the drain delay the process still serves, but tells load
    // balancers to stop routing to it.
    const ready = await fetch(`${baseUrl}/health/ready`, {
      headers: { connection: 'close' },
    });
    expect(ready.status).toBe(503);
    const live = await fetch(`${baseUrl}/health`, {
      headers: { connection: 'close' },
    });
    expect(live.status).toBe(200);

    const response = await inFlight;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { finished: true },
    });

    await shutdown;
    await expect(fetch(`${baseUrl}/health`)).rejects.toThrow();
  });
});
