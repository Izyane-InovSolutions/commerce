// Shared sort vocabulary for public review/rating list reads. A fixed enum
// rather than the generic `?sort=field:asc` convention used elsewhere
// (see ProductQueryDto) since only `rating`/`createdAt` are ever sortable
// here, and the tiebreaker on rating sorts is part of the contract.

export const REVIEW_SORTS = ['newest', 'oldest', 'highest', 'lowest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

type ReviewOrderBy = Array<{ createdAt: 'asc' | 'desc' } | { rating: 'asc' | 'desc' }>;

/**
 * newest (default): createdAt desc.
 * oldest: createdAt asc.
 * highest: rating desc, then createdAt desc (most recent of equally-rated first).
 * lowest: rating asc, then createdAt desc (most recent of equally-rated first).
 */
export function reviewOrderBy(sort: ReviewSort | undefined): ReviewOrderBy {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'highest':
      return [{ rating: 'desc' }, { createdAt: 'desc' }];
    case 'lowest':
      return [{ rating: 'asc' }, { createdAt: 'desc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }];
  }
}
