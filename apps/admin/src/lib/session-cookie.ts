import { cookies } from 'next/headers';

/**
 * Session cookie names for this portal.
 *
 * Cookies are scoped by host and **ignore the port**, so every client running
 * on localhost shares one cookie jar. Each app therefore needs its own names —
 * otherwise signing into one portal overwrites the other's session and you
 * cannot be an admin in one tab and a seller in another.
 */
export const ACCESS_COOKIE = 'commerce_admin_access';
export const REFRESH_COOKIE = 'commerce_admin_refresh';

const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function readAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

/**
 * Stores a freshly issued pair.
 *
 * The access cookie is given the token's own lifetime, so it disappears at the
 * moment the token stops working. "Access cookie absent, refresh cookie
 * present" is then exactly the condition that means *refresh me*, with no
 * clock comparison anywhere.
 */
export async function writeSession(session: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  jar.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: session.expiresIn,
  });
  jar.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
