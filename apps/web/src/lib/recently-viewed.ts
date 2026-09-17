/**
 * Recently viewed products, kept entirely in the browser.
 *
 * There is no backend support for view history (nor a plan for one yet), so
 * this is deliberately client-only — a shopper's own device remembers what
 * they looked at, nothing more. That also means it is per-browser, not
 * per-account: signing in on another device starts a fresh list there.
 */

const STORAGE_KEY = 'commerce:recently-viewed';
const MAX_ENTRIES = 12;

export type RecentlyViewedEntry = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: { amount: number; currency: string } | null;
  viewedAt: number;
};

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
  } catch {
    // Not essential to recording the view actually mattering — see above.
  }
}
