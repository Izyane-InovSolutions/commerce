/**
 * An absolute URL for `path` inside another app served at `baseUrl`.
 *
 * `new URL('/auth/handoff', base)` would resolve the path against the
 * base's *origin*, dropping any path prefix it carries — the seller portal
 * is served under `/seller` (its `basePath`), so that lands on a 404. The
 * path is appended to the base instead, prefix intact.
 */
export function appUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string> = {},
): URL {
  const url = new URL(
    `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`,
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}
