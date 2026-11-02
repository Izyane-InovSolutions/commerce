import { Global, Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsScrapeGuard } from './metrics-scrape.guard';
import { MetricsService } from './metrics.service';
import { OperationalMetricsCollector } from './operational-metrics.collector';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsMiddleware,
    MetricsScrapeGuard,
    OperationalMetricsCollector,
  ],
  exports: [MetricsService, MetricsMiddleware],
})
export class MetricsModule {}
