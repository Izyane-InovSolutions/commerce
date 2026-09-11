/** Query values as Next.js hands them to a page. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Reads a single-valued query parameter, treating blanks as absent. */
export function readParam(
  params: RawSearchParams,
  key: string,
): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single === undefined || single === '' ? undefined : single;
}

/** Builds a href for the current route with some parameters changed. */
export function withParams(
  pathname: string,
  params: RawSearchParams,
  changes: Record<string, string | number | undefined>,
): string {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== '') {
      next.set(key, single);
    }
  }

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }

  const query = next.toString();
  return query === '' ? pathname : `${pathname}?${query}`;
}
