import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { errorCodeForStatus } from './error-codes';
import { RequestWithId } from './request-with-id';
import { ErrorDetail, ErrorEnvelope } from './response-envelope';

type HttpExceptionBody = {
  message?: string | string[];
  details?: unknown;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const status: number =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const { message, details } = this.resolveMessageAndDetails(exception);

    if (status >= (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
      this.logger.error(
        `Unhandled exception for ${request.method} ${request.url} [${request.id}]`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const envelope: ErrorEnvelope = {
      error: {
        code: errorCodeForStatus(status),
        message,
        details,
      },
      requestId: request.id,
    };

    response.status(status).json(envelope);
  }

  private resolveMessageAndDetails(exception: unknown): {
    message: string;
    details: ErrorDetail[];
  } {
    if (!(exception instanceof HttpException)) {
      return { message: 'An unexpected error occurred', details: [] };
    }

    const body = exception.getResponse();

    if (typeof body === 'string') {
      return { message: body, details: [] };
    }

    const { message, details } = body as HttpExceptionBody;

    return {
      message: Array.isArray(message)
        ? message.join(', ')
        : (message ?? exception.message),
      details: this.isErrorDetailArray(details) ? details : [],
    };
  }

  private isErrorDetailArray(value: unknown): value is ErrorDetail[] {
    return (
      Array.isArray(value) &&
      value.every(
        (item) =>
          typeof item === 'object' && item !== null && 'message' in item,
      )
    );
  }
}
