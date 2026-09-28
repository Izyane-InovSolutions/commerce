import { cookies } from 'next/headers';

/**
 * Remembers, across the redirect that follows sign-in, that folding the guest
 * cart into the account failed — so the next page can say so instead of the
 * items silently not being there.
 *
 * App-specific name for the same reason as `GUEST_CART_COOKIE`: every app on
 * localhost shares one cookie jar.
 */
const CART_MERGE_FAILED_COOKIE = 'commerce_web_cart_merge_failed';

/** Long enough to survive the redirect and a little browsing, not so long
 * that a notice outlives the guest cart it is about. */
const NOTICE_TTL_SECONDS = 60 * 60 * 24;

export async function hasCartMergeFailed(): Promise<boolean> {
  return (await cookies()).get(CART_MERGE_FAILED_COOKIE)?.value === '1';
}

/** Cookies can only be written from a server action or route handler. */
export async function flagCartMergeFailed(): Promise<void> {
  (await cookies()).set(CART_MERGE_FAILED_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: NOTICE_TTL_SECONDS,
  });
}

export async function clearCartMergeFailed(): Promise<void> {
  (await cookies()).delete(CART_MERGE_FAILED_COOKIE);
}
