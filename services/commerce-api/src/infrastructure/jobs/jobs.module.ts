import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { BackgroundJobsService } from './background-jobs.service';
import { JobWorkerService } from './job-worker.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [BackgroundJobsService, OutboxService, JobWorkerService],
  exports: [BackgroundJobsService, OutboxService, JobWorkerService],
})
export class JobsModule {}
