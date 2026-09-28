/**
 * Page-number helpers shared by every paged list on the storefront.
 *
 * Pure and framework-free, so the `Pagination` component, the pages that
 * read `?page=` and their tests all agree on the same arithmetic.
 */

type SearchParamValue = string | string[] | undefined;

/** `?page=` as a positive integer; anything else (missing, `0`, `abc`,
 * repeated) reads as the first page rather than as an error. */
export function parsePage(raw: SearchParamValue): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

/** How many pages `total` items fill at `limit` per page — never fewer than
 * one, so an empty list is still "page 1 of 1" rather than "of 0". */
export function pageCount(total: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.max(1, Math.ceil(total / limit));
}

export type PageWindowEntry = number | 'gap';

/**
 * Which page numbers to show: always the first and last, plus `span` either
 * side of the current one, with a `'gap'` wherever pages are skipped.
 * A gap that would hide just one page shows that page instead — "1 … 3"
 * saves nothing over "1 2 3".
 *
 * e.g. current 6 of 12 → `[1, 'gap', 5, 6, 7, 'gap', 12]`.
 */
export function pageWindow(
  current: number,
  count: number,
  span = 1,
): PageWindowEntry[] {
  if (count <= 1) return [1];

  const page = Math.min(Math.max(current, 1), count);
  const shown = new Set<number>([1, count]);
  for (let offset = -span; offset <= span; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= count) shown.add(candidate);
  }

  const sorted = [...shown].sort((left, right) => left - right);
  const entries: PageWindowEntry[] = [];
  let previous = 0;

  for (const value of sorted) {
    if (value - previous === 2) {
      entries.push(value - 1);
    } else if (value - previous > 2) {
      entries.push('gap');
    }
    entries.push(value);
    previous = value;
  }

  return entries;
}
