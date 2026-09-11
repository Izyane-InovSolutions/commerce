import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { BackgroundJob } from '@prisma/client';

import { BackgroundJobsService } from './background-jobs.service';
import { JobHandler } from './job-handler.interface';

const JOB_POLL_INTERVAL_MS = 5_000;

@Injectable()
export class JobWorkerService {
  private readonly logger = new Logger(JobWorkerService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private isProcessing = false;

  constructor(private readonly backgroundJobsService: BackgroundJobsService) {}

  registerHandler(handler: JobHandler): void {
    this.handlers.set(handler.type, handler);
  }

  @Interval(JOB_POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      let job = await this.backgroundJobsService.claimNext();

      while (job) {
        await this.processJob(job);
        job = await this.backgroundJobsService.claimNext();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: BackgroundJob): Promise<void> {
    const handler = this.handlers.get(job.type);

    try {
      if (!handler) {
        throw new Error(`No handler registered for job type "${job.type}"`);
      }

      await handler.handle(job.payload);
      await this.backgroundJobsService.complete(job.id, job.lockToken!);
    } catch (error) {
      this.logger.warn(
        `Job ${job.id} (${job.type}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.backgroundJobsService.fail(job.id, job.lockToken!, error);
    }
  }
}
