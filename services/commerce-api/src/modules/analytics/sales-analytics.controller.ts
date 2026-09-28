import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { SalesAnalyticsQueryDto } from './dto/sales-analytics-query.dto';
import { SalesAnalyticsService } from './sales-analytics.service';
import { SalesAnalyticsDto } from './sales-analytics.types';

@Roles(Role.STAFF, Role.ADMIN)
@Controller('admin/analytics')
export class SalesAnalyticsController {
  constructor(private readonly salesAnalyticsService: SalesAnalyticsService) {}

  @Get('sales')
  getSales(@Query() query: SalesAnalyticsQueryDto): Promise<SalesAnalyticsDto> {
    return this.salesAnalyticsService.getSales(query);
  }
}
