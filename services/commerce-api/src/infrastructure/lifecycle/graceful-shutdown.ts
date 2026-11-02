import type { INestApplication, LoggerService } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';

import { ShutdownState } from './shutdown-state.service';

export type GracefulShutdownOptions = {
  /** Time readiness reports 503 before the server stops accepting. */
  drainDelayMs: number;
  logger: LoggerService;
  signals?: NodeJS.Signals[];
  exit?: (code: number) => void;
};

/**
 * Replaces `app.enableShutdownHooks()`, whose sequence runs onModuleDestroy
 * hooks before the HTTP server stops accepting connections. Here a signal
 * first marks the process as draining (readiness 503), waits `drainDelayMs`
 * for load balancers to notice, then closes the application: the HTTP server
 * stops accepting and in-flight requests finish, the job worker finishes its
 * current job, and the database disconnects last (onApplicationShutdown).
 */
export function installGracefulShutdown(
  app: INestApplication,
  options: GracefulShutdownOptions,
): void {
  const state = app.get(ShutdownState);
  const exit = options.exit ?? ((code: number): void => process.exit(code));
  let started = false;

  const onSignal = (signal: NodeJS.Signals): void => {
    if (started) return;
    started = true;
    options.logger.log(
      `Received ${signal}; draining for ${options.drainDelayMs}ms`,
      'GracefulShutdown',
    );
    shutdownGracefully(app, state, options.drainDelayMs).then(
      () => exit(0),
      (error: unknown) => {
        options.logger.error(
          'Graceful shutdown failed',
          error instanceof Error ? error.stack : undefined,
          'GracefulShutdown',
        );
        exit(1);
      },
    );
  };

  for (const signal of options.signals ?? ['SIGTERM', 'SIGINT'])
    process.once(signal, onSignal);
}

export async function shutdownGracefully(
  app: INestApplication,
  state: ShutdownState,
  drainDelayMs: number,
): Promise<void> {
  state.beginDraining();
  if (drainDelayMs > 0) await sleep(drainDelayMs);
  await app.close();
}
