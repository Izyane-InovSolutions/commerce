import { NextResponse, type NextRequest } from 'next/server';

import { BASE_PATH } from '@/lib/base-path';
import { env } from '@/lib/env';
import { safeNext } from '@/lib/safe-next';
import { writeSession } from '@/lib/session-cookie';

type HandoffExchangeResponse = {
  data: { accessToken: string; refreshToken: string; expiresIn: number };
};

/**
 * Lands a user already signed in on another app (e.g. apps/web) here signed
 * in too, without a second password prompt — this app keeps its own login
 * cookie, so a plain link between the two would otherwise land on sign-in.
 *
 * `code` is a one-time code from `POST /auth/handoff` on the sending app;
 * it's redeemed here, server-to-server, exactly like `middleware.ts`'s own
 * refresh call — a spent, expired, or missing code just falls back to a
 * normal sign-in.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(
    'commerce_seller_handoff_state',
  )?.value;
  const next = safeNext(request.nextUrl.searchParams.get('next'), '/');

  if (!code || !state || !expectedState || state !== expectedState) {
    const rejected = NextResponse.redirect(
      new URL(`${BASE_PATH}/sign-in`, request.url),
    );
    rejected.cookies.delete({
      name: 'commerce_seller_handoff_state',
      path: '/',
    });
    return rejected;
  }

  try {
    const response = await fetch(`${env.apiBaseUrl}/auth/handoff/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.redirect(
        new URL(`${BASE_PATH}/sign-in`, request.url),
      );
    }

    const session = (await response.json()) as HandoffExchangeResponse;
    await writeSession(session.data);
  } catch {
    // The API is unreachable — sign-in can still work on its own.
    return NextResponse.redirect(new URL(`${BASE_PATH}/sign-in`, request.url));
  }

  const redirected = NextResponse.redirect(
    new URL(`${BASE_PATH}${next}`, request.url),
  );
  redirected.cookies.delete({
    name: 'commerce_seller_handoff_state',
    path: '/',
  });
  redirected.headers.set('Referrer-Policy', 'no-referrer');
  return redirected;
}
