import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { OperationsMetricsQueryDto } from './dto/operations-metrics-query.dto';
import { OperationsMetricsService } from './operations-metrics.service';
import { OperationsMetricsDto } from './operations-metrics.types';

@Roles(Role.ADMIN)
@Controller('admin/operations')
export class OperationsMetricsController {
  constructor(
    private readonly operationsMetricsService: OperationsMetricsService,
  ) {}

  @Get('metrics')
  getMetrics(
    @Query() query: OperationsMetricsQueryDto,
  ): Promise<OperationsMetricsDto> {
    return this.operationsMetricsService.getMetrics(query);
  }
}
