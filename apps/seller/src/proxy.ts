import { NextResponse, type NextRequest } from 'next/server';

import { BASE_PATH } from '@/lib/base-path';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from '@/lib/session-cookie';
import { refreshSession } from '@/lib/session-refresh';

/** Forwards the request with its (possibly updated) cookies. */
function forward(request: NextRequest): NextResponse {
  return NextResponse.next({ request: { headers: request.headers } });
}

/**
 * Keeps a signed-in session alive.
 *
 * Access tokens last fifteen minutes and the access cookie carries the token's
 * own lifetime, so "access missing, refresh present" is the signal to renew.
 * Renewal happens here, before the render, because a Server Component can't set
 * cookies — and the new cookies go onto the forwarded request as well as the
 * response, so the page behind this very request already sees the new token
 * (the response's `Set-Cookie` only reaches the browser afterwards).
 *
 * This file has to live in `src/`, next to `app/`: Next ignores a proxy at the
 * project root when the app uses a `src` directory.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (access || !refresh) return forward(request);

  const outcome = await refreshSession(refresh);

  if (outcome.status === 'unavailable') {
    // The API is unreachable; let the page render and report that itself.
    return forward(request);
  }

  if (outcome.status === 'rejected') {
    // Spent or revoked: drop it so this request renders signed out and the
    // next one goes straight to sign-in instead of retrying.
    request.cookies.delete(REFRESH_COOKIE);
    const cleared = forward(request);
    cleared.cookies.delete({ name: REFRESH_COOKIE, path: BASE_PATH });
    return cleared;
  }

  const { accessToken, refreshToken, expiresIn } = outcome.tokens;
  request.cookies.set(ACCESS_COOKIE, accessToken);
  request.cookies.set(REFRESH_COOKIE, refreshToken);

  const renewed = forward(request);
  renewed.cookies.set(
    ACCESS_COOKIE,
    accessToken,
    sessionCookieOptions(expiresIn),
  );
  renewed.cookies.set(
    REFRESH_COOKIE,
    refreshToken,
    sessionCookieOptions(REFRESH_MAX_AGE_SECONDS),
  );
  return renewed;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
