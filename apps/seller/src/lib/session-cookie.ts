import { cookies } from 'next/headers';

import { BASE_PATH } from './base-path';

/**
 * Session cookie names for this portal.
 *
 * Cookies are scoped by host and **ignore the port**, so every client running
 * on localhost shares one cookie jar. Each app therefore needs its own names —
 * otherwise signing into one portal overwrites the other's session and you
 * cannot be an admin in one tab and a seller in another.
 */
export const ACCESS_COOKIE = 'commerce_seller_access';
export const REFRESH_COOKIE = 'commerce_seller_refresh';

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
    path: BASE_PATH,
    maxAge: session.expiresIn,
  });
  jar.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: BASE_PATH,
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  // A cookie is only removed by a delete that matches the path it was
  // written with, so these have to carry BASE_PATH as well.
  jar.delete({ name: ACCESS_COOKIE, path: BASE_PATH });
  jar.delete({ name: REFRESH_COOKIE, path: BASE_PATH });
}
