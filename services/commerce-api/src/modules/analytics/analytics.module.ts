import { Module } from '@nestjs/common';

import { SellersModule } from '../sellers/sellers.module';
import { AttentionService } from './attention.service';
import { SalesAnalyticsController } from './sales-analytics.controller';
import { SalesAnalyticsService } from './sales-analytics.service';
import { SellerAnalyticsController } from './seller-analytics.controller';

@Module({
  imports: [SellersModule],
  controllers: [SalesAnalyticsController, SellerAnalyticsController],
  providers: [SalesAnalyticsService, AttentionService],
})
export class AnalyticsModule {}
