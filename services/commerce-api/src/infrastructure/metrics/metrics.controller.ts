import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/auth/public.decorator';
import { MetricsService } from './metrics.service';
import type { MetricsSnapshot } from './metrics.service';

@ApiTags('operations')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Return process-level API metrics' })
  getMetrics(): MetricsSnapshot {
    return this.metrics.snapshot();
  }
}
