import { env } from './env';

export type RefreshedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type RefreshOutcome =
  /** A new pair. The refresh token that was presented is now spent. */
  | { status: 'renewed'; tokens: RefreshedTokens }
  /** The API refused the refresh token: spent, revoked or expired. */
  | { status: 'rejected' }
  /** The API couldn't be reached or gave no verdict; the session may be fine. */
  | { status: 'unavailable' };

/**
 * How long a finished refresh is remembered against the token it spent.
 *
 * Refresh tokens rotate, and the API treats a second use of a spent one as
 * theft and revokes every session the account has. A page load fires several
 * requests at once (prefetches, a second tab), each carrying the same refresh
 * token; the late ones are answered from memory with the pair the first one
 * already got, instead of signing the user out everywhere.
 */
const SETTLED_TTL_MS = 60_000;

type RefreshStore = {
  inFlight: Map<string, Promise<RefreshOutcome>>;
  settled: Map<string, { outcome: RefreshOutcome; at: number }>;
};

/**
 * Per process, on `globalThis` so separately compiled bundles share it. With
 * several server instances a concurrent refresh can still reach two of them;
 * that fails safe — the API revokes the session and the user signs in again.
 */
const STORE_KEY = Symbol.for('commerce.admin.sessionRefresh');

function store(): RefreshStore {
  const holder = globalThis as typeof globalThis & {
    [STORE_KEY]?: RefreshStore;
  };
  holder[STORE_KEY] ??= { inFlight: new Map(), settled: new Map() };
  return holder[STORE_KEY];
}

function isTokens(value: unknown): value is RefreshedTokens {
  if (typeof value !== 'object' || value === null) return false;
  const tokens = value as Record<string, unknown>;
  return (
    typeof tokens.accessToken === 'string' &&
    typeof tokens.refreshToken === 'string' &&
    typeof tokens.expiresIn === 'number' &&
    tokens.expiresIn > 0
  );
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

  // 401 is the API's verdict on the token itself; a 400 means a stored token
  // was refused as malformed, which amounts to the same. Anything else (5xx,
  // rate limiting) says nothing about the session.
  if (response.status === 401 || response.status === 400) {
    return { status: 'rejected' };
  }
  if (!response.ok) return { status: 'unavailable' };

  try {
    const body = (await response.json()) as { data?: unknown };
    return isTokens(body.data)
      ? { status: 'renewed', tokens: body.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Exchanges a refresh token for a new pair, at most once per token.
 *
 * Callers arriving while a refresh for the same token is in flight share it;
 * callers arriving shortly after get its result. Only a verdict is
 * remembered — an unreachable API is retried on the next request.
 */
export function refreshSession(
  refreshToken: string,
  now: number = Date.now(),
): Promise<RefreshOutcome> {
  const { inFlight, settled } = store();
  for (const [token, entry] of settled) {
    if (now - entry.at > SETTLED_TTL_MS) settled.delete(token);
  }

  const remembered = settled.get(refreshToken);
  if (remembered) return Promise.resolve(remembered.outcome);

  const pending = inFlight.get(refreshToken);
  if (pending) return pending;

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
