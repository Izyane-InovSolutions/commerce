import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorFunction,
  PrismaHealthIndicator,
} from '@nestjs/terminus';

import { PrismaService } from '../../database/prisma.service';

type HealthResponse = {
  status: 'ok';
};

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    const checkDatabase: HealthIndicatorFunction = () =>
      this.prismaIndicator.pingCheck('database', this.prisma);

    return this.health.check([checkDatabase]);
  }
}
