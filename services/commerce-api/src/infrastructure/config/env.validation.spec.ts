import 'reflect-metadata';

import { smtpPort, validate } from './env.validation';

const KEYRING = '{"v1":"dGVzdC1vbmx5LWZpZWxkLWVuY3J5cHRpb24ta2V5ISE="}';
const FINGERPRINT_KEY = 'dGVzdC1vbmx5LWNoZWNrb3V0LWZpbmdlcnByaW50LWtleS0wMDAx';

/** The smallest environment the API accepts; each test varies one thing. */
function env(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/commerce_test',
    SHADOW_DATABASE_URL: 'postgresql://u:p@localhost:5432/commerce_shadow',
    JWT_SECRET: 'test-only-secret-value-that-is-long-enough-1234567890',
    MEDIA_SIGNING_SECRET:
      'test-only-media-secret-that-is-long-enough-1234567890',
    REFRESH_RECOVERY_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
    REFRESH_RECOVERY_ENCRYPTION_KEYS: KEYRING,
    EMAIL_DELIVERY_ENCRYPTION_ACTIVE_KEY_ID: 'v1',
    EMAIL_DELIVERY_ENCRYPTION_KEYS: KEYRING,
    CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID: 'v1',
    CHECKOUT_FINGERPRINT_KEYS: JSON.stringify({ v1: FINGERPRINT_KEY }),
    SMTP_HOST: 'smtp.example.com',
    EMAIL_FROM: 'Commerce <no-reply@example.com>',
    CUSTOMER_WEB_URL: 'https://shop.example.com',
    ...overrides,
  };
}

describe('validate', () => {
  it('accepts the minimal environment', () => {
    expect(() => validate(env())).not.toThrow();
  });

  // Every verification and reset email links to it; without it those routes
  // 500 at request time, so the API must refuse to start instead.
  it('requires CUSTOMER_WEB_URL', () => {
    const { CUSTOMER_WEB_URL, ...rest } = env();
    void CUSTOMER_WEB_URL;
    expect(() => validate(rest)).toThrow(/CUSTOMER_WEB_URL/);
  });

  describe('checkout fingerprint keyring', () => {
    it.each([
      'CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID',
      'CHECKOUT_FINGERPRINT_KEYS',
    ])('requires %s', (name) => {
      const config = env();
      delete config[name];
      expect(() => validate(config)).toThrow(new RegExp(name));
    });

    it('accepts a rotated ring whose active key is not the first', () => {
      expect(() =>
        validate(
          env({
            CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID: 'k_2026-10',
            CHECKOUT_FINGERPRINT_KEYS: JSON.stringify({
              v1: FINGERPRINT_KEY,
              'k_2026-10': Buffer.alloc(48, 7).toString('base64'),
            }),
          }),
        ),
      ).not.toThrow();
    });

    it.each([
      [
        'an active key id with a colon',
        { CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID: 'v:1' },
      ],
      [
        'an active key id longer than 32 characters',
        { CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID: 'k'.repeat(33) },
      ],
      [
        'an active key missing from the ring',
        { CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID: 'v2' },
      ],
      ['a ring that is not JSON', { CHECKOUT_FINGERPRINT_KEYS: 'v1=abc' }],
      ['a ring that is a JSON array', { CHECKOUT_FINGERPRINT_KEYS: '[]' }],
      [
        'a key shorter than 32 bytes',
        {
          CHECKOUT_FINGERPRINT_KEYS: JSON.stringify({
            v1: Buffer.alloc(31, 1).toString('base64'),
          }),
        },
      ],
      [
        'a key that is not strict base64',
        {
          CHECKOUT_FINGERPRINT_KEYS: JSON.stringify({
            v1: 'change-me-to-a-base64-32-byte-key-value-please',
          }),
        },
      ],
      [
        'an invalid retired key id',
        {
          CHECKOUT_FINGERPRINT_KEYS: JSON.stringify({
            v1: FINGERPRINT_KEY,
            'old key': FINGERPRINT_KEY,
          }),
        },
      ],
    ])('rejects %s', (_case, overrides) => {
      expect(() => validate(env(overrides))).toThrow(/CHECKOUT_FINGERPRINT/);
    });

    it('never echoes key material in its errors', () => {
      const secret = Buffer.alloc(16, 9).toString('base64');
      let message = '';
      try {
        validate(
          env({ CHECKOUT_FINGERPRINT_KEYS: JSON.stringify({ v1: secret }) }),
        );
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/CHECKOUT_FINGERPRINT_KEYS/);
      expect(message).not.toContain(secret);
    });
  });

  it('rejects implicit TLS on the STARTTLS port', () => {
    expect(() =>
      validate(env({ SMTP_PORT: '587', SMTP_SECURE: 'true' })),
    ).toThrow(/SMTP_PORT=587 requires SMTP_SECURE=false/);
  });

  it.each([
    [{ SMTP_PORT: '587', SMTP_SECURE: 'false' }],
    [{ SMTP_PORT: '465', SMTP_SECURE: 'true' }],
    [{ SMTP_SECURE: 'true' }],
    [{ SMTP_PORT: '', SMTP_SECURE: 'true' }],
    [{ SMTP_PORT: '1025' }],
  ])('accepts a working SMTP pairing %p', (overrides) => {
    expect(() => validate(env(overrides))).not.toThrow();
  });

  it('defaults SMTP_SECURE to false and leaves a blank port unset', () => {
    const config = validate(env({ SMTP_PORT: '' }));
    expect(config.SMTP_SECURE).toBe('false');
    expect(config.SMTP_PORT).toBeUndefined();
  });
});

describe('smtpPort', () => {
  it.each([
    [undefined, 'true', 465],
    [undefined, 'false', 587],
    ['', 'true', 465],
    [2525, 'true', 2525],
    ['1025', 'false', 1025],
  ])('port %p with secure=%p -> %p', (port, secure, expected) => {
    expect(smtpPort(port, secure)).toBe(expected);
  });
});
