import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { RequestWithId } from './request-with-id';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps the handler result with data and the request id', (done) => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const request = { id: 'req-1' } as RequestWithId;

    const context = {
      switchToHttp: () => ({ getRequest: (): RequestWithId => request }),
    } as unknown as ExecutionContext;

    const handler: CallHandler = { handle: () => of({ status: 'ok' }) };

    interceptor.intercept(context, handler).subscribe((result) => {
      expect(result).toEqual({
        data: { status: 'ok' },
        meta: { requestId: 'req-1' },
      });
      done();
    });
  });
});
