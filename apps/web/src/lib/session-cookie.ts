import { cookies, headers } from 'next/headers';

import { refreshSession } from './session-refresh';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  isAccessTokenExpiring,
  parseSessionCookies,
  sessionCookieOptions,
  type StoredTokens,
} from './session-tokens';

export { REFRESH_COOKIE, SESSION_COOKIE } from './session-tokens';

async function readSession(): Promise<StoredTokens> {
  const jar = await cookies();
  return parseSessionCookies(
    jar.get(SESSION_COOKIE)?.value,
    jar.get(REFRESH_COOKIE)?.value,
  );
}

export async function readAccessToken(): Promise<string | undefined> {
  return (await readSession()).accessToken;
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await readSession()).refreshToken;
}

/**
 * Persists both tokens from a login/register/refresh response.
 *
 * The access cookie is given the token's own lifetime, so it lapses the
 * moment the token stops working; the refresh cookie outlives it. "Access
 * missing, refresh present" is then the signal `proxy.ts` renews on, before
 * the page that needs the session renders.
 */
export async function writeSession(
  accessToken: string,
  refreshToken: string,
  accessTokenTtlSeconds: number,
): Promise<void> {
  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    accessToken,
    sessionCookieOptions(accessTokenTtlSeconds),
  );
  jar.set(
    REFRESH_COOKIE,
    refreshToken,
    sessionCookieOptions(REFRESH_COOKIE_MAX_AGE_SECONDS),
  );
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/**
 * Renews the session after the API answered 401, returning the new access
 * token — or undefined when renewing isn't the right response.
 *
 * `proxy.ts` renews ahead of expiry on every request, so this only matters
 * for a request that straddled the moment its token expired. Everything else
 * is left alone on purpose:
 *
 * - A 401 while the token is still comfortably valid isn't an expiry. It is
 *   a revoked session (signed out elsewhere, password reset) or an endpoint's
 *   own refusal, like a wrong current password — and presenting a revoked
 *   session's refresh token makes the API revoke *every* session the account
 *   has, so this must not try.
 * - Only a server action may write cookies. Renewing during a render would
 *   spend the refresh token without storing its replacement, so the next
 *   request would present the spent one.
 */
export async function renewSessionAfterUnauthorized(): Promise<
  string | undefined
> {
  const { accessToken, refreshToken } = await readSession();
  if (!accessToken || !refreshToken || !isAccessTokenExpiring(accessToken)) {
    return undefined;
  }

  // Server actions arrive as a POST carrying this header; nothing else in
  // this app that reaches the API is allowed to set a cookie.
  if (!(await headers()).has('next-action')) {
    return undefined;
  }

  const outcome = await refreshSession(refreshToken);

  try {
    if (outcome.status === 'renewed') {
      await writeSession(
        outcome.tokens.accessToken,
        outcome.tokens.refreshToken,
        outcome.tokens.expiresIn,
      );
    } else if (outcome.status === 'rejected') {
      await clearSession();
    }
  } catch {
    // Cookies turned out not to be writable after all (an action's
    // follow-up render). The renewed pair is still remembered against the
    // spent token, so the next request's proxy pass stores it.
  }

  return outcome.status === 'renewed' ? outcome.tokens.accessToken : undefined;
}
