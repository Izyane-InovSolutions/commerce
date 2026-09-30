import { configureTestProviders } from './test-provider-env';

describe('test provider isolation', () => {
  it('overrides inherited live providers without changing the selected database', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'development',
      SCHEDULED_WORKERS_ENABLED: 'true',
      PAYMENTS_PROVIDER: 'unified',
      MEDIA_STORAGE_DRIVER: 's3',
      SMTP_URL: 'smtps://example.invalid',
      SMTP_HOST: 'mail.example.invalid',
      SMTP_USER: 'real-user',
      SMTP_PASS: 'real-password',
      PAYMENT_FX_API_KEY: 'real-key',
      UNIFIED_PAYMENTS_API_KEY: 'real-key',
      DATABASE_URL: 'postgresql://test:test@localhost/commerce_test',
    };
    configureTestProviders(env);
    expect(env.NODE_ENV).toBe('test');
    expect(env.SCHEDULED_WORKERS_ENABLED).toBe('false');
    expect(env.PAYMENTS_PROVIDER).toBe('pending');
    expect(env.MEDIA_STORAGE_DRIVER).toBe('local');
    expect(env.SMTP_HOST).toBe('127.0.0.1');
    expect(env.SMTP_PORT).toBe('1');
    expect(env.SMTP_USER).toBe('');
    expect(env.SMTP_PASS).toBe('');
    expect(env.SMTP_URL).toBeUndefined();
    expect(env.PAYMENT_FX_API_KEY).toBeUndefined();
    expect(env.UNIFIED_PAYMENTS_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBe(
      'postgresql://test:test@localhost/commerce_test',
    );
  });
});
