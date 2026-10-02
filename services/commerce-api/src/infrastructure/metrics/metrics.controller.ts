import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';

import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { MetricsScrapeGuard } from './metrics-scrape.guard';
import { MetricsService } from './metrics.service';
import type { ProcessMetricsSnapshot } from './metrics.service';
import { OperationalMetricsCollector } from './operational-metrics.collector';
import type { OperationalGauges } from './operational-metrics.collector';
import { PROMETHEUS_CONTENT_TYPE, renderPrometheus } from './prometheus-format';

export type MetricsSnapshot = ProcessMetricsSnapshot & {
  operational: OperationalGauges;
};

@ApiTags('operations')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly collector: OperationalMetricsCollector,
  ) {}

  @Roles(Role.ADMIN)
  @Get()
  @ApiOperation({
    summary: 'Return process, request, queue and database metrics',
  })
  async getMetrics(): Promise<MetricsSnapshot> {
    return {
      ...this.metrics.snapshot(),
      operational: await this.collector.collect(),
    };
  }

  @Public()
  @UseGuards(MetricsScrapeGuard)
  @Get('prometheus')
  @ApiOperation({
    summary: 'Prometheus exposition for the configured internal scraper',
  })
  async getPrometheusMetrics(@Res() res: Response): Promise<void> {
    const body = renderPrometheus(
      this.metrics.series(),
      this.metrics.processMetrics(),
      await this.collector.collect(),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.type(PROMETHEUS_CONTENT_TYPE).send(body);
  }
}
