import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';

export type RecurringTaskOptions = {
  /** Unique across the process — SchedulerRegistry rejects duplicates. */
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
  logger: Logger;
};

/** Whether this process runs scheduled work at all (see JobsModule). */
export function scheduledWorkersEnabled(config: ConfigService): boolean {
  return config.get<string>('SCHEDULED_WORKERS_ENABLED') !== 'false';
}

/**
 * Runs `run` every `intervalMs`, for sweeps whose cadence comes from the
 * environment — a static `@Interval()` is evaluated at import time and can't
 * read ConfigService.
 *
 * An interval added to SchedulerRegistry by hand bypasses the `intervals`
 * flag JobsModule passes to ScheduleModule.forRoot, so this honours
 * SCHEDULED_WORKERS_ENABLED=false itself. A tick that finds the previous run
 * still going is skipped rather than stacked, and a failed run is logged
 * rather than left as an unhandled rejection. The registry clears the timer
 * on application shutdown.
 *
 * Returns whether the task was scheduled.
 */
export function registerRecurringTask(
  registry: SchedulerRegistry,
  config: ConfigService,
  options: RecurringTaskOptions,
): boolean {
  if (!scheduledWorkersEnabled(config)) return false;

  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await options.run();
    } catch (error) {
      options.logger.error(
        `${options.name} failed`,
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      running = false;
    }
  };

  registry.addInterval(
    options.name,
    setInterval(() => void tick(), options.intervalMs),
  );
  return true;
}
