import {
  ServiceUnavailableException,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';

import { AdmissionGuard } from './admission.guard';

describe('AdmissionGuard', () => {
  it('sheds excess work with 503, recovers after completion, and keeps probes available', () => {
    const guard = new AdmissionGuard({
      get: () => 1,
    } as unknown as ConfigService);
    const response = (): EventEmitter & { setHeader: jest.Mock } =>
      Object.assign(new EventEmitter(), { setHeader: jest.fn() });
    const context = (path: string, res: EventEmitter): ExecutionContext =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ route: { path } }),
          getResponse: () => res,
        }),
      }) as unknown as ExecutionContext;

    const first = response();
    expect(guard.canActivate(context('/api/v1/catalog/products', first))).toBe(
      true,
    );
    const rejected = response();
    expect(() =>
      guard.canActivate(context('/api/v1/catalog/products', rejected)),
    ).toThrow(ServiceUnavailableException);
    expect(rejected.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(guard.canActivate(context('/api/v1/health/ready', response()))).toBe(
      true,
    );
    expect(guard.canActivate(context('/api/v1/metrics', response()))).toBe(
      true,
    );
    first.emit('finish');
    first.emit('close');
    expect(
      guard.canActivate(context('/api/v1/catalog/products', response())),
    ).toBe(true);
  });
});
