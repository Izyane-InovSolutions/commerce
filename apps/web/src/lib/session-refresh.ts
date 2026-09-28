import type { AuthTokens, SuccessEnvelope } from './auth-types';
import { env } from './env';

export type RefreshOutcome =
  /** A new pair. The refresh token that was presented is now spent. */
  | { status: 'renewed'; tokens: AuthTokens }
  /** The API refused the refresh token: spent, revoked or expired. Nothing
   * will bring this session back, so the caller should clear it. */
  | { status: 'rejected' }
  /** The API couldn't be reached, or answered with something other than a
   * verdict. The session may still be fine; leave it alone. */
  | { status: 'unavailable' };

/**
 * How long a finished refresh is remembered against the token it spent.
 *
 * Refresh tokens rotate, and the API treats a *second* use of a spent one as
 * token theft — it revokes every session the account has. A browser firing
 * several requests at once (parallel prefetches, a second tab) sends the same
 * refresh token with each, and the ones that arrive after the first renewal
 * has finished, but before its `Set-Cookie` reached the browser, would trip
 * exactly that. Answering those from memory, with the pair the first request
 * already got, is what keeps a normal page load from signing someone out of
 * every device.
 */
const SETTLED_TTL_MS = 60_000;

type RefreshStore = {
  inFlight: Map<string, Promise<RefreshOutcome>>;
  settled: Map<string, { outcome: RefreshOutcome; at: number }>;
};

/**
 * Kept on `globalThis` so the proxy and the server-action bundle — which Next
 * compiles separately — share one store within a process.
 *
 * It is per process, though: with several server instances a concurrent
 * refresh can still land on two of them. That's the worst case left, and it
 * fails safe — the API revokes the session, and the shopper signs in again.
 */
const STORE_KEY = Symbol.for('commerce.web.sessionRefresh');

function store(): RefreshStore {
  const holder = globalThis as typeof globalThis & {
    [STORE_KEY]?: RefreshStore;
  };
  holder[STORE_KEY] ??= { inFlight: new Map(), settled: new Map() };
  return holder[STORE_KEY];
}

function sweep(settled: RefreshStore['settled'], now: number): void {
  for (const [token, entry] of settled) {
    if (now - entry.at > SETTLED_TTL_MS) settled.delete(token);
  }
}

async function callRefresh(refreshToken: string): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
  } catch {
    return { status: 'unavailable' };
  }

  // 401 is the API's only verdict on the token itself (unknown, reused,
  // expired, or the account deactivated); a 400 means the body was refused,
  // which for a stored token amounts to the same thing. Anything else — a
  // 5xx, a rate limit — says nothing about the session.
  if (response.status === 401 || response.status === 400) {
    return { status: 'rejected' };
  }
  if (!response.ok) {
    return { status: 'unavailable' };
  }

  try {
    const body = (await response.json()) as SuccessEnvelope<AuthTokens>;
    return { status: 'renewed', tokens: body.data };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Exchanges a refresh token for a new pair, at most once per token.
 *
 * Callers that arrive while a refresh for the same token is in flight wait
 * for that one; callers that arrive shortly after get its result. Only a
 * verdict is remembered — an unreachable API is retried on the next request.
 */
export function refreshSession(
  refreshToken: string,
  now: number = Date.now(),
): Promise<RefreshOutcome> {
  const { inFlight, settled } = store();
  sweep(settled, now);

  const remembered = settled.get(refreshToken);
  if (remembered) {
    return Promise.resolve(remembered.outcome);
  }

  const pending = inFlight.get(refreshToken);
  if (pending) {
    return pending;
  }

  const request = callRefresh(refreshToken)
    .then((outcome) => {
      if (outcome.status !== 'unavailable') {
        settled.set(refreshToken, { outcome, at: Date.now() });
      }
      return outcome;
    })
    .finally(() => {
      inFlight.delete(refreshToken);
    });

  inFlight.set(refreshToken, request);
  return request;
}

/** Test-only: forgets every remembered refresh. */
export function resetRefreshStore(): void {
  const { inFlight, settled } = store();
  inFlight.clear();
  settled.clear();
}
