import { NextResponse, type NextRequest } from 'next/server';

import { BASE_PATH } from '@/lib/base-path';
import { hasValidMutationOrigin } from '@/lib/request-origin';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from '@/lib/session-cookie';
import { refreshSession } from '@/lib/session-refresh';

/**
 * Forwards the request, adding the bearer token to `/api/*` calls that are
 * rewritten to the Commerce API (see `next.config.ts`) and carry none.
 */
function isApiRequest(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return pathname.startsWith('/api') || pathname.startsWith(`${BASE_PATH}/api`);
}

function forward(
  request: NextRequest,
  token: string | undefined,
): NextResponse {
  if (
    token &&
    isApiRequest(request) &&
    !request.headers.has('authorization')
  ) {
    request.headers.set('authorization', `Bearer ${token}`);
  }
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
  // This proxy turns an HttpOnly session cookie into a Bearer header, so a
  // browser mutation must come from this exact site before it does; SameSite
  // stays a second layer rather than the only CSRF control.
  if (
    isApiRequest(request) &&
    !hasValidMutationOrigin(
      request.method,
      request.headers.get('origin'),
      request.nextUrl.origin,
    )
  ) {
    return NextResponse.json(
      { error: { code: 'INVALID_ORIGIN', message: 'Invalid request origin' } },
      { status: 403 },
    );
  }

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (access || !refresh) return forward(request, access);

  const outcome = await refreshSession(refresh);

  if (outcome.status === 'unavailable') {
    // The API is unreachable; let the page render and report that itself.
    return forward(request, undefined);
  }

  if (outcome.status === 'rejected') {
    // Spent or revoked: drop it so this request renders signed out and the
    // next one goes straight to sign-in instead of retrying.
    request.cookies.delete(REFRESH_COOKIE);
    const cleared = forward(request, undefined);
    cleared.cookies.delete({ name: REFRESH_COOKIE, path: BASE_PATH });
    return cleared;
  }

  const { accessToken, refreshToken, expiresIn } = outcome.tokens;
  request.cookies.set(ACCESS_COOKIE, accessToken);
  request.cookies.set(REFRESH_COOKIE, refreshToken);

  const renewed = forward(request, accessToken);
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
