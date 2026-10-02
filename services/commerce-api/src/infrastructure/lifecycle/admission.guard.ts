import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { routeTemplate } from '../metrics/metrics.middleware';

/** Bounds requests doing application work. Health and metrics retain access
 * when ordinary traffic is shed so the process remains observable. */
@Injectable()
export class AdmissionGuard implements CanActivate {
  private active = 0;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const route = routeTemplate(request);
    if (
      route?.startsWith('/api/v1/health') ||
      route?.startsWith('/api/v1/metrics')
    ) {
      return true;
    }

    const limit = this.config.get<number>('MAX_IN_FLIGHT_REQUESTS', 16);
    if (this.active >= limit) {
      response.setHeader('Retry-After', '1');
      throw new ServiceUnavailableException(
        'The service is busy; retry shortly',
      );
    }

    this.active++;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      this.active--;
    };
    response.once('finish', release);
    response.once('close', release);
    return true;
  }
}
