import { cookies } from 'next/headers';

/**
 * Name of this app's session cookie.
 *
 * Cookies are scoped by host and **ignore the port**, so every client running
 * on localhost shares one cookie jar. Each app therefore needs its own cookie
 * name — otherwise signing into the storefront could overwrite a session in
 * the admin or seller portal, or vice versa.
 */
export const SESSION_COOKIE = 'commerce_web_session';

type StoredSession = {
  accessToken: string;
  refreshToken: string;
};

async function readSession(): Promise<StoredSession | undefined> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return undefined;
  }
}

export async function readAccessToken(): Promise<string | undefined> {
  return (await readSession())?.accessToken;
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await readSession())?.refreshToken;
}

/**
 * Persists both tokens from a login/register response.
 *
 * The cookie's own lifetime is capped to the access token's, not the longer-
 * lived refresh token's: this app doesn't yet refresh access tokens in the
 * background, so keeping the cookie around past that point would just leave
 * a session that looks present but silently fails every request.
 */
export async function writeSession(
  accessToken: string,
  refreshToken: string,
  accessTokenTtlSeconds: number,
): Promise<void> {
  (await cookies()).set(
    SESSION_COOKIE,
    JSON.stringify({ accessToken, refreshToken }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: accessTokenTtlSeconds,
    },
  );
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
