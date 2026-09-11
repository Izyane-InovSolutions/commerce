import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorFunction,
  PrismaHealthIndicator,
} from '@nestjs/terminus';

import { Public } from '../../common/auth/public.decorator';
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

  @Public()
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    const checkDatabase: HealthIndicatorFunction = () =>
      this.prismaIndicator.pingCheck('database', this.prisma);

    return this.health.check([checkDatabase]);
  }
}
