import Link from 'next/link';
import { Star } from 'lucide-react';

import type { RatingHistogram } from '@/lib/catalog-types';
import { cn } from '@/lib/utils';

const STAR_VALUES = [5, 4, 3, 2, 1] as const;

/** A row of five stars, filled up to `rating` (rounded to the nearest
 * whole star — the average itself is printed alongside wherever it's used). */
export function Stars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  const filled = Math.round(rating);

  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          className={cn(
            'size-3.5',
            value <= filled
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/40',
          )}
        />
      ))}
    </span>
  );
}

/**
 * The average, the count, and one bar per star value.
 *
 * Every number here comes straight from the API's rating summary — nothing
 * is recomputed from the (paged) review list, which only ever holds one
 * page of it. With `hrefForRating`, each bar also filters the list below it
 * to that star value (the API filters on an exact rating, not a minimum).
 */
export function RatingBreakdown({
  averageRating,
  ratingCount,
  histogram,
  selectedRating,
  hrefForRating,
}: {
  averageRating: number | null;
  ratingCount: number;
  histogram: RatingHistogram;
  selectedRating?: number;
  hrefForRating?: (rating: number | undefined) => string;
}) {
  if (averageRating === null || ratingCount === 0) {
    return <p className="text-muted-foreground text-sm">No ratings yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
      <div className="space-y-1">
        <p className="text-3xl font-semibold tracking-tight">
          {averageRating.toFixed(1)}
          <span className="text-muted-foreground text-base font-normal">
            {' '}
            / 5
          </span>
        </p>
        <Stars rating={averageRating} />
        <p className="text-muted-foreground text-xs">
          {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
        </p>
      </div>

      <ul className="w-full max-w-sm space-y-1">
        {STAR_VALUES.map((value) => {
          const count = histogram[value] ?? 0;
          const share = ratingCount > 0 ? (count / ratingCount) * 100 : 0;
          const selected = selectedRating === value;
          const row = (
            <>
              <span className="w-10 shrink-0 text-xs">{value} star</span>
              <span className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-400"
                  style={{ width: `${share}%` }}
                />
              </span>
              <span className="text-muted-foreground w-8 shrink-0 text-right text-xs">
                {count}
              </span>
            </>
          );

          return (
            <li key={value}>
              {hrefForRating && count > 0 ? (
                <Link
                  href={hrefForRating(selected ? undefined : value)}
                  scroll={false}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={
                    selected
                      ? `Showing ${value}-star reviews; show all`
                      : `Show ${value}-star reviews (${count})`
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60',
                    selected && 'bg-muted font-medium',
                  )}
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-2 px-1 py-0.5">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type ReviewListItem = {
  id: string;
  rating: number;
  title?: string | null;
  body: string | null;
  reviewerLabel: string;
  verifiedPurchase: boolean;
  createdAt: string;
};

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** One page of reviews or seller ratings, already filtered and sorted by
 * the API. */
export function ReviewList({
  reviews,
  emptyMessage,
}: {
  reviews: ReviewListItem[];
  emptyMessage: string;
}) {
  if (reviews.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y">
      {reviews.map((review) => (
        <li key={review.id} className="space-y-1.5 py-4 first:pt-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Stars rating={review.rating} />
            {review.title ? (
              <p className="text-sm font-medium">{review.title}</p>
            ) : null}
          </div>
          {review.body ? (
            <p className="text-sm text-pretty whitespace-pre-line">
              {review.body}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {review.reviewerLabel}
            {review.verifiedPurchase ? ' · Verified purchase' : ''} ·{' '}
            <time dateTime={review.createdAt}>
              {formatReviewDate(review.createdAt)}
            </time>
          </p>
        </li>
      ))}
    </ul>
  );
}
