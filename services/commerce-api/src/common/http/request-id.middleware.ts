import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';

import { runWithRequestContext } from '../../infrastructure/logging/request-context';
import { REQUEST_ID_HEADER, RequestWithId } from './request-with-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incomingId = req.header(REQUEST_ID_HEADER);
    req.id = incomingId && incomingId.length > 0 ? incomingId : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, req.id);
    runWithRequestContext({ requestId: req.id }, next);
  }
}
