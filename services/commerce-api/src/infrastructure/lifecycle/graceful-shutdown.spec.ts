import type { INestApplication, LoggerService } from '@nestjs/common';

import {
  installGracefulShutdown,
  shutdownGracefully,
} from './graceful-shutdown';
import { ShutdownState } from './shutdown-state.service';

describe('graceful shutdown', () => {
  it('marks the process draining, waits the drain delay, then closes', async () => {
    const state = new ShutdownState();
    const events: string[] = [];
    const app = {
      close: jest.fn(() => {
        events.push(`close:draining=${state.isDraining}`);
        return Promise.resolve();
      }),
    } as unknown as INestApplication;

    const startedAt = Date.now();
    await shutdownGracefully(app, state, 50);

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(45);
    expect(events).toEqual(['close:draining=true']);
  });

  it('handles the first signal, exits 0 after closing, and ignores later ones', async () => {
    const state = new ShutdownState();
    let closed!: () => void;
    const closing = new Promise<void>((resolve) => (closed = resolve));
    const close = jest.fn(() => {
      closed();
      return Promise.resolve();
    });
    const app = { get: () => state, close } as unknown as INestApplication;
    const exit = jest.fn();
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as LoggerService;

    installGracefulShutdown(app, {
      drainDelayMs: 0,
      logger,
      // Signals Node accepts listeners for on every platform, and that
      // Jest itself does not handle.
      signals: ['SIGHUP', 'SIGWINCH'],
      exit,
    });
    process.emit('SIGHUP', 'SIGHUP');
    process.emit('SIGWINCH', 'SIGWINCH');
    await closing;
    await new Promise((resolve) => setImmediate(resolve));

    expect(state.isDraining).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
