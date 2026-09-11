import { AppLogger } from './app-logger.service';
import { runWithRequestContext } from './request-context';

type ParsedLine = {
  timestamp: string;
  level: string;
  context?: string;
  message: unknown;
  requestId?: string;
  details?: unknown;
};

function captureStdout(run: () => void): ParsedLine {
  const spy = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);

  run();

  const written = spy.mock.calls[0]?.[0] as string;
  spy.mockRestore();

  return JSON.parse(written) as ParsedLine;
}

describe('AppLogger', () => {
  it('writes a structured JSON line with level, message, and context', () => {
    const logger = new AppLogger();

    const entry = captureStdout(() => logger.log('hello world', 'MyService'));

    expect(entry.level).toBe('log');
    expect(entry.message).toBe('hello world');
    expect(entry.context).toBe('MyService');
    expect(entry.timestamp).toEqual(expect.any(String));
  });

  it('includes the request id when called within a request context', () => {
    const logger = new AppLogger();

    const entry = captureStdout(() => {
      runWithRequestContext({ requestId: 'req-123' }, () =>
        logger.log('hello'),
      );
    });

    expect(entry.requestId).toBe('req-123');
  });

  it('omits the request id outside of a request context', () => {
    const logger = new AppLogger();

    const entry = captureStdout(() => logger.log('hello'));

    expect(entry.requestId).toBeUndefined();
  });

  it('redacts sensitive fields in object arguments', () => {
    const logger = new AppLogger();

    const entry = captureStdout(() =>
      logger.log(
        'login attempt',
        { email: 'a@b.com', password: 'hunter2' },
        'AuthService',
      ),
    );

    expect(entry.details).toEqual({ email: 'a@b.com', password: '[REDACTED]' });
  });

  it('writes error-level logs to stderr', () => {
    const logger = new AppLogger();
    const spy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    logger.error('something failed');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
