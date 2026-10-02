import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MetricsScrapeGuard } from './metrics-scrape.guard';

const TOKEN = 'scrape-token-for-tests-0123456789abcdef';

function context(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) =>
          name === 'authorization' ? authorization : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function guard(token?: string): MetricsScrapeGuard {
  return new MetricsScrapeGuard({
    get: () => token,
  } as unknown as ConfigService);
}

describe('MetricsScrapeGuard', () => {
  it('admits the configured bearer token', () => {
    expect(guard(TOKEN).canActivate(context(`Bearer ${TOKEN}`))).toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['a wrong token', 'Bearer not-the-token'],
    ['a token prefix', `Bearer ${TOKEN.slice(0, 10)}`],
    ['another scheme', `Basic ${TOKEN}`],
  ])('rejects %s', (_label, header) => {
    expect(() => guard(TOKEN).canActivate(context(header))).toThrow(
      UnauthorizedException,
    );
  });

  it('hides the route entirely when no token is configured', () => {
    expect(() =>
      guard(undefined).canActivate(context(`Bearer ${TOKEN}`)),
    ).toThrow(NotFoundException);
    expect(() => guard('').canActivate(context('Bearer '))).toThrow(
      NotFoundException,
    );
  });
});
