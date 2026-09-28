/**
 * The storefront's session cookies, and the pure decisions made about them.
 *
 * Nothing here touches `next/headers`, so the proxy (which reads cookies off
 * the request object), server actions (which go through `cookies()`) and the
 * unit tests can all share it.
 *
 * Cookies are scoped by host and **ignore the port**, so every client running
 * on localhost shares one cookie jar. Each app therefore needs its own cookie
 * names — otherwise signing into the storefront could overwrite a session in
 * the admin or seller portal, or vice versa.
 */

/** The access token. Its lifetime is the token's own, so the browser drops it
 * the moment the API would stop accepting it. */
export const SESSION_COOKIE = 'commerce_web_session';

/** The refresh token, kept apart so it can outlive the access token — the
 * pair only has to be renewed, not signed into again, while this is present. */
export const REFRESH_COOKIE = 'commerce_web_refresh';

/**
 * The refresh cookie's lifetime: the API's default `REFRESH_TOKEN_TTL_SECONDS`.
 * The refresh response doesn't say how long the new token lasts, so this is a
 * ceiling rather than a promise — a token the API has already expired is
 * rejected on use, and the session is cleared then.
 */
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * How close to expiry an access token is renewed ahead of time. A token with
 * a few seconds left would pass the check here and then expire on its way to
 * the API, failing a request the shopper can do nothing about.
 */
export const REFRESH_AHEAD_SECONDS = 30;

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
};

export function sessionCookieOptions(maxAge: number): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export type StoredTokens = {
  accessToken?: string;
  refreshToken?: string;
};

/**
 * Reads the pair back out of the two raw cookie values.
 *
 * Sessions written before the refresh cookie existed kept both tokens as JSON
 * in the one session cookie; those are still honoured, so nobody signed in
 * at the time is signed out by the change.
 */
export function parseSessionCookies(
  sessionValue: string | undefined,
  refreshValue: string | undefined,
): StoredTokens {
  let accessToken: string | undefined = sessionValue || undefined;
  let legacyRefresh: string | undefined;

  if (sessionValue?.startsWith('{')) {
    try {
      const legacy = JSON.parse(sessionValue) as {
        accessToken?: unknown;
        refreshToken?: unknown;
      };
      accessToken =
        typeof legacy.accessToken === 'string' ? legacy.accessToken : undefined;
      legacyRefresh =
        typeof legacy.refreshToken === 'string'
          ? legacy.refreshToken
          : undefined;
    } catch {
      accessToken = undefined;
    }
  }

  return { accessToken, refreshToken: refreshValue || legacyRefresh };
}

/**
 * The `exp` claim of a JWT, in epoch seconds, or null if it has none.
 *
 * Decoded, not verified: the API verifies every token it is sent, and this is
 * only used to decide *when* to renew one — a forged `exp` would at worst
 * make this app renew early or late, never grant anything.
 */
export function accessTokenExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof claims.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
}

/** True once an access token has expired or is about to. An unreadable token
 * counts as expired — the API would refuse it anyway. */
export function isAccessTokenExpiring(
  token: string,
  nowMs: number = Date.now(),
): boolean {
  const exp = accessTokenExpiry(token);
  return exp === null || exp * 1000 - nowMs <= REFRESH_AHEAD_SECONDS * 1000;
}

/**
 * Whether a request should renew the session before it goes any further:
 * there is a refresh token to renew with, and the access token is missing
 * (its cookie lapsed with it) or on its way out.
 */
export function shouldRefresh(
  tokens: StoredTokens,
  nowMs: number = Date.now(),
): boolean {
  if (!tokens.refreshToken) return false;
  return (
    !tokens.accessToken || isAccessTokenExpiring(tokens.accessToken, nowMs)
  );
}
