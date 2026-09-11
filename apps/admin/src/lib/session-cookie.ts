import { cookies } from 'next/headers';

/**
 * Name of this portal's session cookie.
 *
 * Cookies are scoped by host and **ignore the port**, so every client running
 * on localhost shares one cookie jar. Each app therefore needs its own cookie
 * name — otherwise signing into one portal overwrites the other's session and
 * you cannot be an admin in one tab and a seller in another.
 *
 * Keep this unique per app even once the portals have their own hostnames: a
 * shared parent domain would reintroduce exactly the same clash.
 */
export const SESSION_COOKIE = 'commerce_admin_session';

/**
 * The session token, read from an httpOnly cookie.
 *
 * Kept apart from the API client so reading it cannot pull the client into a
 * circular import, and so nothing on the client side can reach the token.
 */
export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function writeSessionToken(
  token: string,
  expiresAt: string,
): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearSessionToken(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
