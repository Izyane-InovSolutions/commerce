/**
 * Recently viewed products, kept entirely in the browser.
 *
 * There is no backend support for view history (nor a plan for one yet), so
 * this is deliberately browser-only — a shopper's own device remembers what
 * they looked at, nothing more. That also means it is per-browser, not
 * per-account: signing in on another device starts a fresh list there.
 *
 * The full entries (name, image, price) live in localStorage for the
 * "recently viewed" shelf. A slim copy — slugs and categories only — also
 * goes in the `recent_views` cookie, so the server can base recommendations
 * on it when rendering the homepage (see `recent-views-cookie.ts`).
 */

const STORAGE_KEY = 'commerce:recently-viewed';
const MAX_ENTRIES = 12;
export const RECENT_VIEWS_COOKIE = 'recent_views';
/** Enough to spot a shopper's leading interests without growing the cookie. */
const COOKIE_ENTRIES = 10;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export type RecentlyViewedEntry = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: { amount: number; currency: string } | null;
  /** Optional: entries recorded before categories were kept lack it. */
  categorySlug?: string | null;
  viewedAt: number;
};

/** What the cookie carries per view: `s` slug, `c` category slug. */
export type RecentViewCookieEntry = { s: string; c: string | null };

function isEntry(value: unknown): value is RecentlyViewedEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RecentlyViewedEntry).id === 'string' &&
    typeof (value as RecentlyViewedEntry).slug === 'string'
  );
}

/** Empty outside the browser, and whenever storage cannot be read at all. */
export function getRecentlyViewed(): RecentlyViewedEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/**
 * Moves this product to the front of the list, trimming it to the most
 * recent handful.
 *
 * Best-effort: a viewer in private browsing, or one who has exhausted their
 * storage quota, simply does not get a history — that is not worth failing
 * the page load over.
 */
export function recordProductView(
  entry: Omit<RecentlyViewedEntry, 'viewedAt'>,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const rest = getRecentlyViewed().filter((item) => item.id !== entry.id);
    const next = [{ ...entry, viewedAt: Date.now() }, ...rest].slice(
      0,
      MAX_ENTRIES,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    writeCookie(next);
  } catch {
    // Not essential to recording the view actually mattering — see above.
  }
}

function writeCookie(entries: RecentlyViewedEntry[]): void {
  const slim: RecentViewCookieEntry[] = entries
    .slice(0, COOKIE_ENTRIES)
    .map((entry) => ({ s: entry.slug, c: entry.categorySlug ?? null }));
  document.cookie = `${RECENT_VIEWS_COOKIE}=${encodeURIComponent(
    JSON.stringify(slim),
  )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

/**
 * For `useSyncExternalStore`: the stored list as its raw string (stable
 * while unchanged, so React can compare snapshots cheaply), empty when
 * storage can't be read.
 */
export function readRecentlyViewedSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Re-reads when another tab records a view. */
export function subscribeRecentlyViewed(onChange: () => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

/** Parses a snapshot from `readRecentlyViewedSnapshot`. */
export function parseRecentlyViewed(raw: string): RecentlyViewedEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}
