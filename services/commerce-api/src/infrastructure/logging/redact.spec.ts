import { redact } from './redact';

describe('redact', () => {
  it('redacts known-sensitive keys at the top level', () => {
    expect(redact({ email: 'a@b.com', password: 'hunter2' })).toEqual({
      email: 'a@b.com',
      password: '[REDACTED]',
    });
  });

  it('matches sensitive keys case-insensitively', () => {
    expect(redact({ Password: 'hunter2', ACCESSTOKEN: 'abc' })).toEqual({
      Password: '[REDACTED]',
      ACCESSTOKEN: '[REDACTED]',
    });
  });

  it('redacts nested objects', () => {
    expect(
      redact({ user: { email: 'a@b.com', currentPassword: 'x' } }),
    ).toEqual({
      user: { email: 'a@b.com', currentPassword: '[REDACTED]' },
    });
  });

  it('redacts objects inside arrays', () => {
    expect(redact([{ token: 'abc' }, { email: 'a@b.com' }])).toEqual([
      { token: '[REDACTED]' },
      { email: 'a@b.com' },
    ]);
  });

  it('leaves primitives, dates, and errors untouched', () => {
    const date = new Date();
    const error = new Error('boom');

    expect(redact('hello')).toBe('hello');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
    expect(redact(date)).toBe(date);
    expect(redact(error)).toBe(error);
  });

  it('does not mutate the input', () => {
    const input = { password: 'hunter2' };

    redact(input);

    expect(input).toEqual({ password: 'hunter2' });
  });

  it('handles circular references without throwing', () => {
    const input: Record<string, unknown> = { name: 'a' };
    input.self = input;

    expect(() => redact(input)).not.toThrow();
  });
});
