import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { RequestWithId } from './request-with-id';

function createHost(requestId: string): {
  host: ArgumentsHost;
  json: jest.Mock;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const request = {
    id: requestId,
    method: 'GET',
    url: '/api/v1/whatever',
  } as RequestWithId;
  const response = { status };

  const host = {
    switchToHttp: () => ({
      getRequest: (): RequestWithId => request,
      getResponse: (): { status: jest.Mock } => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('maps a NotFoundException to a NOT_FOUND error envelope', () => {
    const { host, json, status } = createHost('req-1');

    filter.catch(new NotFoundException('missing'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'missing', details: [] },
      requestId: 'req-1',
    });
  });

  it('passes through structured validation details', () => {
    const { host, json } = createHost('req-2');

    filter.catch(
      new BadRequestException({
        message: 'The request is invalid',
        details: [{ field: 'email', message: 'email must be an email' }],
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid',
        details: [{ field: 'email', message: 'email must be an email' }],
      },
      requestId: 'req-2',
    });
  });

  it('maps unknown errors to an INTERNAL_ERROR envelope without leaking the message', () => {
    const { host, json, status } = createHost('req-3');

    filter.catch(new Error('database connection string leaked'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: [],
      },
      requestId: 'req-3',
    });
  });

  it('maps a plain error carrying a client-error status (e.g. body-parser) to its own status and message', () => {
    const { host, json, status } = createHost('req-4');
    const payloadTooLarge = Object.assign(
      new Error('request entity too large'),
      { status: 413 },
    );

    filter.catch(payloadTooLarge, host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'request entity too large',
        details: [],
      },
      requestId: 'req-4',
    });
  });

  it('does not leak the message of a plain error carrying a 5xx status', () => {
    const { host, json, status } = createHost('req-5');
    const badGateway = Object.assign(new Error('upstream connection refused'), {
      status: 502,
    });

    filter.catch(badGateway, host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: [],
      },
      requestId: 'req-5',
    });
  });
});
