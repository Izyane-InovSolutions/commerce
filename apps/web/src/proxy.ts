import { NextResponse, type NextRequest } from 'next/server';

import { refreshSession } from '@/lib/session-refresh';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE,
  parseSessionCookies,
  sessionCookieOptions,
  shouldRefresh,
} from '@/lib/session-tokens';

/**
 * Keeps a signed-in session alive.
 *
 * Access tokens last fifteen minutes. Renewal has to happen here rather than
 * during a render, because a Server Component can't set cookies — and it has
 * to happen *before* the render, so the page (or server action) behind this
 * request already sees the new token. That's why the new cookies go onto the
 * forwarded request as well as the response: the response's `Set-Cookie` only
 * reaches the browser once this request is over.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const tokens = parseSessionCookies(
    request.cookies.get(SESSION_COOKIE)?.value,
    request.cookies.get(REFRESH_COOKIE)?.value,
  );

  if (!shouldRefresh(tokens) || !tokens.refreshToken) {
    return NextResponse.next();
  }

  const outcome = await refreshSession(tokens.refreshToken);

  if (outcome.status === 'unavailable') {
    // The API is unreachable. Let the page render and report that itself;
    // the next request tries again.
    return NextResponse.next();
  }

  if (outcome.status === 'rejected') {
    // Spent, revoked or expired: drop the session so this request renders
    // signed out and the next one doesn't retry a token that can't work.
    request.cookies.delete(SESSION_COOKIE);
    request.cookies.delete(REFRESH_COOKIE);
    const cleared = NextResponse.next({
      request: { headers: request.headers },
    });
    cleared.cookies.delete(SESSION_COOKIE);
    cleared.cookies.delete(REFRESH_COOKIE);
    return cleared;
  }

  const { accessToken, refreshToken, expiresIn } = outcome.tokens;
  request.cookies.set(SESSION_COOKIE, accessToken);
  request.cookies.set(REFRESH_COOKIE, refreshToken);

  const renewed = NextResponse.next({ request: { headers: request.headers } });
  renewed.cookies.set(
    SESSION_COOKIE,
    accessToken,
    sessionCookieOptions(expiresIn),
  );
  renewed.cookies.set(
    REFRESH_COOKIE,
    refreshToken,
    sessionCookieOptions(REFRESH_COOKIE_MAX_AGE_SECONDS),
  );
  return renewed;
}

export const config = {
  // Everything that renders or runs a server action. Not build assets, image
  // optimisation, or `/api/v1/*` — that is rewritten straight to the API (see
  // `next.config.ts`) for signed media URLs, which need no session.
  matcher: [
    '/((?!_next/static|_next/image|api/v1/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
