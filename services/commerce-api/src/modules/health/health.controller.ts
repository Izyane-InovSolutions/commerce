import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorFunction,
  PrismaHealthIndicator,
} from '@nestjs/terminus';

import { Public } from '../../common/auth/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { ShutdownState } from '../../infrastructure/lifecycle/shutdown-state.service';

type HealthResponse = {
  status: 'ok';
};

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly shutdown: ShutdownState,
  ) {}

  // Liveness: answers without touching dependencies, so a database outage
  // never gets a healthy process restarted.
  @Public()
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    if (this.shutdown.isDraining) {
      throw new ServiceUnavailableException('The service is shutting down');
    }

    const checkDatabase: HealthIndicatorFunction = () =>
      this.prismaIndicator.pingCheck('database', this.prisma);

    return this.health.check([checkDatabase]);
  }
}
