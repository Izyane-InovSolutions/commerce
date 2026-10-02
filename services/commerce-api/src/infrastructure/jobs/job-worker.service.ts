import {
  Injectable,
  Logger,
  Optional,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { BackgroundJob } from '@prisma/client';
import { setTimeout as sleep } from 'node:timers/promises';

import { MetricsService } from '../metrics/metrics.service';
import { BackgroundJobsService } from './background-jobs.service';
import { JobHandler } from './job-handler.interface';

const JOB_POLL_INTERVAL_MS = 5_000;
// Bounded so a hung handler cannot stall shutdown; the job's lease then
// expires and another worker reclaims it.
const SHUTDOWN_JOB_GRACE_MS = 10_000;

@Injectable()
export class JobWorkerService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(JobWorkerService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private isProcessing = false;
  private stopping = false;
  private current?: Promise<void>;

  constructor(
    private readonly backgroundJobsService: BackgroundJobsService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  registerHandler(handler: JobHandler): void {
    this.handlers.set(handler.type, handler);
  }

  @Interval(JOB_POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (this.isProcessing || this.stopping) {
      return;
    }

    this.isProcessing = true;
    const run = this.drain();
    this.current = run;

    try {
      await run;
    } finally {
      this.isProcessing = false;
      this.current = undefined;
    }
  }

  /** Stops claiming new jobs and lets the one in progress finish. */
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (!this.current) return;
    const finished = await Promise.race([
      this.current.then(
        () => true,
        () => true,
      ),
      sleep(SHUTDOWN_JOB_GRACE_MS, false, { ref: false }),
    ]);
    if (!finished)
      this.logger.warn(
        'Shutting down with a job still running; its lease will expire',
      );
  }

  private async drain(): Promise<void> {
    let job = await this.backgroundJobsService.claimNext();

    while (job) {
      await this.processJob(job);
      if (this.stopping) return;
      job = await this.backgroundJobsService.claimNext();
    }
  }

  private async processJob(job: BackgroundJob): Promise<void> {
    const handler = this.handlers.get(job.type);
    const startedAt = Date.now();
    // run_at is when the job became due — its enqueue time, or the end of
    // its retry backoff — so this is eligible-to-start lag on every attempt.
    const startLagMs =
      job.runAt instanceof Date
        ? Math.max(0, startedAt - job.runAt.getTime())
        : null;

    try {
      if (!handler) {
        throw new Error(`No handler registered for job type "${job.type}"`);
      }

      await handler.handle(job.payload);
      await this.backgroundJobsService.complete(job.id, job.lockToken!);
      this.metrics?.recordJob(
        job.type,
        'succeeded',
        Date.now() - startedAt,
        startLagMs,
      );
    } catch (error) {
      this.logger.warn(
        `Job ${job.id} (${job.type}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.backgroundJobsService.fail(job.id, job.lockToken!, error);
      const exhausted = job.attempts >= job.maxAttempts;
      this.metrics?.recordJob(
        job.type,
        exhausted ? 'dead_letter' : 'failed',
        Date.now() - startedAt,
        startLagMs,
      );
      if (exhausted && handler?.onDeadLetter) {
        try {
          await handler.onDeadLetter(job.payload);
        } catch {
          this.logger.error(`Dead-letter cleanup failed for job ${job.id}`);
        }
      }
    }
  }
}
