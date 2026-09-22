import { ConfigService } from '@nestjs/config';

import { PendingPaymentProvider } from './pending-payment.provider';
import { resolvePaymentProvider } from './payments.module';
import { UnifiedPaymentProvider } from './unified-payment.provider';

describe('resolvePaymentProvider', () => {
  const pending = new PendingPaymentProvider();
  const unified = { name: 'unified' } as UnifiedPaymentProvider;
  // @nestjs/config falls back to process.env for any key missing from the
  // internal config object, so the real ambient PAYMENTS_PROVIDER (set in
  // this project's .env) would otherwise leak into the "default" case below.
  const originalEnv = process.env.PAYMENTS_PROVIDER;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PAYMENTS_PROVIDER;
    else process.env.PAYMENTS_PROVIDER = originalEnv;
  });

  it('resolves PendingPaymentProvider by default', () => {
    delete process.env.PAYMENTS_PROVIDER;
    const config = new ConfigService({});

    expect(resolvePaymentProvider(config, pending, unified)).toBe(pending);
  });

  it('resolves PendingPaymentProvider when PAYMENTS_PROVIDER is explicitly "pending"', () => {
    const config = new ConfigService({ PAYMENTS_PROVIDER: 'pending' });

    expect(resolvePaymentProvider(config, pending, unified)).toBe(pending);
  });

  it('resolves UnifiedPaymentProvider when PAYMENTS_PROVIDER is "unified"', () => {
    const config = new ConfigService({ PAYMENTS_PROVIDER: 'unified' });

    expect(resolvePaymentProvider(config, pending, unified)).toBe(unified);
  });
});
