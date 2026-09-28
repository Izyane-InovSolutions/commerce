import { describe, expect, it } from 'vitest';

import {
  REFRESH_AHEAD_SECONDS,
  accessTokenExpiry,
  isAccessTokenExpiring,
  parseSessionCookies,
  shouldRefresh,
} from './session-tokens';

/** An unsigned JWT-shaped token — only the payload matters here. */
function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;
}

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);
const nowSeconds = NOW / 1000;

describe('parseSessionCookies', () => {
  it('reads the access and refresh cookies as they are', () => {
    expect(parseSessionCookies('access', 'refresh')).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('treats missing or empty cookies as absent', () => {
    expect(parseSessionCookies(undefined, undefined)).toEqual({
      accessToken: undefined,
      refreshToken: undefined,
    });
    expect(parseSessionCookies('', '')).toEqual({
      accessToken: undefined,
      refreshToken: undefined,
    });
  });

  it('still reads a session written in the old one-cookie JSON form', () => {
    const legacy = JSON.stringify({ accessToken: 'a', refreshToken: 'r' });

    expect(parseSessionCookies(legacy, undefined)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    });
    // A refresh cookie, once there is one, wins over the legacy copy.
    expect(parseSessionCookies(legacy, 'newer')).toEqual({
      accessToken: 'a',
      refreshToken: 'newer',
    });
  });

  it('ignores a corrupt legacy cookie', () => {
    expect(parseSessionCookies('{not json', undefined)).toEqual({
      accessToken: undefined,
      refreshToken: undefined,
    });
  });
});

describe('accessTokenExpiry', () => {
  it('reads the exp claim', () => {
    expect(accessTokenExpiry(jwt({ sub: 'u', exp: 1234 }))).toBe(1234);
  });

  it('is null for a token without a readable exp', () => {
    expect(accessTokenExpiry(jwt({ sub: 'u' }))).toBeNull();
    expect(accessTokenExpiry('not-a-jwt')).toBeNull();
    expect(accessTokenExpiry('a.@@@.c')).toBeNull();
  });
});

describe('isAccessTokenExpiring', () => {
  it('is false with time to spare', () => {
    expect(isAccessTokenExpiring(jwt({ exp: nowSeconds + 600 }), NOW)).toBe(
      false,
    );
  });

  it('is true once inside the renew-ahead margin, or past expiry', () => {
    expect(
      isAccessTokenExpiring(
        jwt({ exp: nowSeconds + REFRESH_AHEAD_SECONDS - 1 }),
        NOW,
      ),
    ).toBe(true);
    expect(isAccessTokenExpiring(jwt({ exp: nowSeconds - 5 }), NOW)).toBe(
      true,
    );
  });

  it('treats an unreadable token as expired', () => {
    expect(isAccessTokenExpiring('garbage', NOW)).toBe(true);
  });
});

describe('shouldRefresh', () => {
  const fresh = jwt({ exp: nowSeconds + 600 });
  const stale = jwt({ exp: nowSeconds + 5 });

  it('never refreshes without a refresh token', () => {
    expect(shouldRefresh({ accessToken: stale }, NOW)).toBe(false);
    expect(shouldRefresh({}, NOW)).toBe(false);
  });

  it('refreshes when the access cookie has lapsed', () => {
    expect(shouldRefresh({ refreshToken: 'r' }, NOW)).toBe(true);
  });

  it('refreshes a token about to expire, but not a fresh one', () => {
    expect(shouldRefresh({ accessToken: stale, refreshToken: 'r' }, NOW)).toBe(
      true,
    );
    expect(shouldRefresh({ accessToken: fresh, refreshToken: 'r' }, NOW)).toBe(
      false,
    );
  });
});
