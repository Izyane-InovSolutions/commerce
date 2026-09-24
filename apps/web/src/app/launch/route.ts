import { NextResponse, type NextRequest } from 'next/server';

import { apiClient } from '@/lib/api';
import type { Role, SuccessEnvelope } from '@/lib/auth-types';
import { safeNext } from '@/lib/safe-next';
import { getCurrentUser } from '@/lib/session';

type HandoffCodeResponse = { code: string; expiresIn: number };

/**
 * Where each role belongs. All three apps share one origin — `vercel.json`
 * routes `/admin` and `/seller` to their own services — so these are ordinary
 * in-app paths, not cross-origin links.
 *
 * STAFF lands in the admin portal alongside ADMIN: the portal draws its own
 * distinction between them, and `requireAdmin` will turn away anyone who does
 * not belong once they arrive.
 */
const PORTAL_BY_ROLE: Record<Role, string> = {
  ADMIN: '/admin',
  STAFF: '/admin',
  SELLER: '/seller',
  CUSTOMER: '/',
};

/**
 * Sends a signed-in user to whichever app matches their role, so nobody has to
 * know that `/admin` and `/seller` exist or which one is theirs.
 *
 * The portals keep their own session cookies, scoped to their own paths — a
 * plain redirect would land an admin on a second login form even though they
 * just signed in here. So for anyone leaving this app, a one-time handoff code
 * is minted first and handed to the portal's own `/auth/handoff`, which
 * redeems it server-to-server and writes that portal's cookies. Same mechanism
 * apps/seller already used; it simply had no caller until now.
 *
 * If minting fails the user still gets routed to the right portal — they just
 * sign in again there, which is the behaviour without this route at all.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    // `next` brings them back here after signing in, so the dispatch below
    // runs once they actually have a session.
    const signIn = new URL('/account', request.url);
    signIn.searchParams.set('next', '/launch');
    return NextResponse.redirect(signIn);
  }

  const destination = PORTAL_BY_ROLE[user.role] ?? '/';
  const next = safeNext(request.nextUrl.searchParams.get('next'), '/');

  if (destination === '/') {
    return NextResponse.redirect(new URL(next, request.url));
  }

  try {
    const minted = await apiClient.post<SuccessEnvelope<HandoffCodeResponse>>(
      '/auth/handoff',
      { cache: 'no-store' },
    );

    const handoff = new URL(`${destination}/auth/handoff`, request.url);
    handoff.searchParams.set('code', minted.data.code);
    handoff.searchParams.set('next', next);
    return NextResponse.redirect(handoff);
  } catch {
    // The portal's own sign-in page is a fine fallback.
    return NextResponse.redirect(new URL(destination, request.url));
  }
}
