import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();
    let statusCode = response.statusCode;

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          statusCode =
            error instanceof HttpException
              ? error.getStatus()
              : response.statusCode >= 400
                ? response.statusCode
                : 500;
        },
      }),
      finalize(() => {
        const routePath: unknown = (
          request as unknown as { route?: { path?: unknown } }
        ).route?.path;
        const route = typeof routePath === 'string' ? routePath : request.path;
        this.metrics.recordRequest(
          request.method,
          route,
          statusCode,
          performance.now() - startedAt,
        );
      }),
    );
  }
}
