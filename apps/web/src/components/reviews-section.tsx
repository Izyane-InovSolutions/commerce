import { ApiErrorNotice } from '@/components/api-error-notice';
import { Pagination } from '@/components/pagination';
import {
  RatingBreakdown,
  ReviewList,
  type ReviewListItem,
} from '@/components/rating-breakdown';
import { SelectNavigation } from '@/components/select-navigation';
import { REVIEW_SORTS, type RatingHistogram } from '@/lib/catalog-types';
import { REVIEW_SORT_LABELS, type ReviewParams } from '@/lib/review-query';

/**
 * A rating breakdown with one page of the reviews behind it — shared by the
 * product page (product reviews) and the seller page (seller ratings), which
 * the API serves with the same paging, sort and star filter.
 *
 * `hrefFor` builds a link to this same page with the review list's state
 * changed, so the host page decides how that state sits alongside its own.
 */
export function ReviewsSection({
  id,
  title,
  summary,
  params,
  result,
  pageSize,
  hrefFor,
  emptyMessage,
}: {
  id: string;
  title: string;
  summary: {
    averageRating: number | null;
    ratingCount: number;
    histogram: RatingHistogram;
  };
  params: ReviewParams;
  result:
    | { ok: true; reviews: ReviewListItem[]; total: number }
    | { ok: false; error: unknown };
  pageSize: number;
  hrefFor: (review: ReviewParams) => string;
  emptyMessage: string;
}) {
  const hasRatings = summary.ratingCount > 0;

  return (
    <section id={id} className="scroll-mt-20 space-y-5" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>

      <RatingBreakdown
        averageRating={summary.averageRating}
        ratingCount={summary.ratingCount}
        histogram={summary.histogram}
        selectedRating={params.rating}
        hrefForRating={(rating) => hrefFor({ ...params, rating, page: 1 })}
      />

      {hasRatings ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {params.rating
              ? `Showing ${params.rating}-star reviews only.`
              : 'Showing all reviews.'}
          </p>
          <SelectNavigation
            id={`${id}-sort`}
            label="Sort by:"
            value={params.sort}
            options={REVIEW_SORTS.map((sort) => ({
              value: sort,
              label: REVIEW_SORT_LABELS[sort],
              href: hrefFor({ ...params, sort, page: 1 }),
            }))}
          />
        </div>
      ) : null}

      {!result.ok ? (
        <ApiErrorNotice error={result.error} />
      ) : hasRatings ? (
        <div className="space-y-4">
          <ReviewList reviews={result.reviews} emptyMessage={emptyMessage} />
          <Pagination
            label={`${title} pages`}
            page={params.page}
            total={result.total}
            limit={pageSize}
            scroll={false}
            hrefForPage={(page) => hrefFor({ ...params, page })}
          />
        </div>
      ) : null}
    </section>
  );
}
