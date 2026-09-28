import { safeNext } from './safe-next';

/**
 * Where a notification's "View" goes: its `link` when that is an in-app
 * path, else nowhere. The link comes from the API, but is still checked
 * like any other outside input before it becomes an `href` — only a rooted
 * path on this site, never another origin.
 */
export function notificationHref(link: string | null): string | null {
  const href = safeNext(link, '');
  return href === '' ? null : href;
}

/** The header badge's text: exact up to 99, then "99+". */
export function unreadBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) {
    return null;
  }
  return count > 99 ? '99+' : String(Math.floor(count));
}
