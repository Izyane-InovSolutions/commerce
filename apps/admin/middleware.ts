import { NextResponse, type NextRequest } from 'next/server';

import { BASE_PATH } from '@/lib/base-path';

const ACCESS_COOKIE = 'commerce_admin_access';
const REFRESH_COOKIE = 'commerce_admin_refresh';
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3005/api/v1';

type RefreshedSession = {
  data: { accessToken: string; refreshToken: string; expiresIn: number };
};

/**
 * Keeps a signed-in session alive.
 *
 * Access tokens last fifteen minutes, so without this every portal would sign
 * itself out mid-afternoon. The access cookie carries the token's own
 * lifetime, which makes "access missing, refresh present" the signal to renew
 * — and renewal has to happen here rather than during a render, because only
 * middleware and route handlers may set cookies on the way out.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  // Forwards Bearer token from session cookie for proxied /api calls if not already supplied
  const createNextResponse = (accessToken?: string): NextResponse => {
    const isApiRequest = request.nextUrl.pathname.startsWith('/api');
    const token = accessToken ?? access;
    if (isApiRequest && token && !request.headers.has('authorization')) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('authorization', `Bearer ${token}`);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.next();
  };

  if (access || !refresh) {
    return createNextResponse();
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
      cache: 'no-store',
    });

    if (!response.ok) {
      // The refresh token is spent or revoked; drop it so the next request
      // goes straight to the sign-in form instead of retrying every time.
      const cleared = NextResponse.next();
      cleared.cookies.delete({ name: REFRESH_COOKIE, path: BASE_PATH });
      return cleared;
    }

    const session = (await response.json()) as RefreshedSession;
    const next = createNextResponse(session.data.accessToken);
    const secure = process.env.NODE_ENV === 'production';

    next.cookies.set(ACCESS_COOKIE, session.data.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: BASE_PATH,
      maxAge: session.data.expiresIn,
    });
    next.cookies.set(REFRESH_COOKIE, session.data.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: BASE_PATH,
      maxAge: 30 * 24 * 60 * 60,
    });

    return next;
  } catch {
    // The API is unreachable. Let the page render and report that itself.
    return createNextResponse();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
