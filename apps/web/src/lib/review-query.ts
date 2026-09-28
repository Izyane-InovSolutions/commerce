import { REVIEW_SORTS, type ReviewSort } from './catalog-types';
import { parsePage } from './pagination';

/**
 * URL state for a paged review list that shares its page with other paged
 * state — the product page (which also carries `?variant=`) and the seller
 * page (which also pages its products). Each list's keys are prefixed so
 * neither's page number clobbers the other's.
 */

type SearchParams = Record<string, string | string[] | undefined>;

export type ReviewParams = {
  page: number;
  sort: ReviewSort;
  /** An exact star value to show only, or undefined for all. */
  rating?: number;
};

export const DEFAULT_REVIEW_SORT: ReviewSort = 'newest';

export const REVIEW_SORT_LABELS: Record<ReviewSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  highest: 'Highest rated',
  lowest: 'Lowest rated',
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseReviewParams(
  params: SearchParams,
  prefix: string,
): ReviewParams {
  const sort = first(params[`${prefix}Sort`]);
  const rating = Number(first(params[`${prefix}Rating`]));

  return {
    page: parsePage(params[`${prefix}Page`]),
    sort: (REVIEW_SORTS as readonly string[]).includes(sort ?? '')
      ? (sort as ReviewSort)
      : DEFAULT_REVIEW_SORT,
    rating:
      Number.isInteger(rating) && rating >= 1 && rating <= 5
        ? rating
        : undefined,
  };
}

/** The review list's own search entries, defaults left out. */
export function reviewSearchEntries(
  review: ReviewParams,
  prefix: string,
): Record<string, string | undefined> {
  return {
    [`${prefix}Page`]: review.page > 1 ? String(review.page) : undefined,
    [`${prefix}Sort`]:
      review.sort !== DEFAULT_REVIEW_SORT ? review.sort : undefined,
    [`${prefix}Rating`]:
      review.rating !== undefined ? String(review.rating) : undefined,
  };
}

/** `path` with the given entries as its query string, skipping undefined. */
export function hrefWithSearch(
  path: string,
  entries: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
