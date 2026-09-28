import { cookies } from 'next/headers';

import {
  RECENT_VIEWS_COOKIE,
  type RecentViewCookieEntry,
} from '@/lib/recently-viewed';

/** Reads a `recent_views` cookie value; anything malformed is no history. */
export function parseRecentViews(
  raw: string | undefined,
): RecentViewCookieEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentViewCookieEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RecentViewCookieEntry).s === 'string' &&
        ((entry as RecentViewCookieEntry).c === null ||
          typeof (entry as RecentViewCookieEntry).c === 'string'),
    );
  } catch {
    return [];
  }
}

/**
 * The categories a shopper has been browsing, strongest interest first: most
 * views, ties going to the more recent. Views are newest-first in the cookie.
 */
export function rankInterests(views: RecentViewCookieEntry[]): string[] {
  const score = new Map<string, { count: number; latest: number }>();
  views.forEach((view, index) => {
    if (!view.c) return;
    const held = score.get(view.c);
    score.set(view.c, {
      count: (held?.count ?? 0) + 1,
      latest: Math.min(held?.latest ?? index, index),
    });
  });
  return [...score.entries()]
    .sort(
      ([, left], [, right]) =>
        right.count - left.count || left.latest - right.latest,
    )
    .map(([slug]) => slug);
}

/** The visitor's recent views, from the request's cookie. */
export async function readRecentViews(): Promise<RecentViewCookieEntry[]> {
  return parseRecentViews((await cookies()).get(RECENT_VIEWS_COOKIE)?.value);
}
