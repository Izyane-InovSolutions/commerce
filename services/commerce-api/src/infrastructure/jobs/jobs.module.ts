import { Global, Module } from '@nestjs/common';

import { BackgroundJobsService } from './background-jobs.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [BackgroundJobsService, OutboxService],
  exports: [BackgroundJobsService, OutboxService],
})
export class JobsModule {}
