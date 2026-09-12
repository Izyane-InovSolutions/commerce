import { cookies } from 'next/headers';

/**
 * Name of the guest cart token.
 *
 * Cookies ignore the port, so every app on localhost shares one jar — hence
 * the app-specific name, matching `SESSION_COOKIE`.
 */
export const GUEST_CART_COOKIE = 'commerce_web_guest_cart';

/** Header the API reads a guest cart's identity from. */
export const GUEST_TOKEN_HEADER = 'x-guest-token';

/** Long enough that a cart survives browsing across a few days. */
const GUEST_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function readGuestToken(): Promise<string | undefined> {
  return (await cookies()).get(GUEST_CART_COOKIE)?.value;
}

/**
 * Stores the token the API minted for a guest's cart.
 *
 * Only the first add to an anonymous cart returns one; every later request
 * carries it back, which is what makes the cart the same cart.
 */
export async function writeGuestToken(token: string): Promise<void> {
  (await cookies()).set(GUEST_CART_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_COOKIE_TTL_SECONDS,
  });
}

export async function clearGuestToken(): Promise<void> {
  (await cookies()).delete(GUEST_CART_COOKIE);
}
