import { Module } from '@nestjs/common';

import { SalesAnalyticsController } from './sales-analytics.controller';
import { SalesAnalyticsService } from './sales-analytics.service';

@Module({
  controllers: [SalesAnalyticsController],
  providers: [SalesAnalyticsService],
})
export class AnalyticsModule {}
