import { Injectable, LoggerService, LogLevel } from '@nestjs/common';

import { getRequestId } from './request-context';
import { redact } from './redact';

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  context?: string;
  message: unknown;
  requestId?: string;
  details?: unknown;
};

@Injectable()
export class AppLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  private write(
    level: LogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    // Nest's Logger appends the calling class's context as the final
    // optional param (e.g. `new Logger('AuthService')` -> log(msg, 'AuthService')).
    const params = [...optionalParams];
    const context =
      typeof params[params.length - 1] === 'string'
        ? (params.pop() as string)
        : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: redact(message instanceof Error ? message.message : message),
      requestId: getRequestId(),
      ...(params.length > 0
        ? { details: redact(params.length === 1 ? params[0] : params) }
        : {}),
    };

    const line = JSON.stringify(entry);

    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}
