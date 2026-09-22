// Shared read helpers for ProductRatingSummary/SellerRatingSummary — both
// models carry the same five star-bucket columns plus ratingCount/ratingSum,
// recomputed elsewhere (RatingAggregateService) and only ever read here.

/** Structural shape both ProductRatingSummary and SellerRatingSummary satisfy. */
export type RatingSummaryLike = {
  ratingCount: number;
  ratingSum: number;
  star1Count: number;
  star2Count: number;
  star3Count: number;
  star4Count: number;
  star5Count: number;
};

export type RatingHistogram = {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
};

/** null when never rated, rather than recomputed — read straight from the summary row. */
export function averageRatingFromSummary(
  summary: RatingSummaryLike | null | undefined,
): number | null {
  if (!summary || summary.ratingCount === 0) return null;
  return summary.ratingSum / summary.ratingCount;
}

/** All-zero histogram for a product/seller with no ProductRatingSummary/SellerRatingSummary row yet. */
export function ratingHistogramFromSummary(
  summary: RatingSummaryLike | null | undefined,
): RatingHistogram {
  return {
    1: summary?.star1Count ?? 0,
    2: summary?.star2Count ?? 0,
    3: summary?.star3Count ?? 0,
    4: summary?.star4Count ?? 0,
    5: summary?.star5Count ?? 0,
  };
}
