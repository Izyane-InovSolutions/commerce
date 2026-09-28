import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  backendGetAdminReview,
  backendListAdminReviews,
} from '@commerce/api-client';
import {
  backendReviewTargetSchema,
  type BackendAdminReviewsPage,
  type BackendReviewReport,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import {
  DismissReportForm,
  ModerationDecisionForm,
} from '@/components/moderation-forms';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { explainMissingRoute } from '@/lib/api-route-errors';
import {
  isModerationFiltered,
  moderationDecisionsFor,
  readModerationFilters,
  reviewModerationStates,
  reviewVisibilities,
  toAdminReviewQuery,
} from '@/lib/moderation';
import { requireAdmin } from '@/lib/session';

import { dismissReportAction, moderateReviewAction } from './actions';

export const metadata: Metadata = { title: 'Moderation' };

type Review = BackendAdminReviewsPage['items'][number];

/**
 * Product reviews and seller ratings live in separate tables, so an id alone
 * does not name one.
 */
function reviewKey(review: { type: string; id: string }): string {
  return `${review.type}:${review.id}`;
}

/** `PERSONAL_INFORMATION` → "Personal information". */
function humanize(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The open reports behind each reported review on this page.
 *
 * The list carries only report ids; why someone reported it is on the detail
 * read. Only reviews with an open report are fetched, and a failed read
 * leaves that review's reports listed by id rather than taking down the
 * queue — they can still be dismissed.
 */
async function openReportsFor(
  items: Review[],
): Promise<Map<string, BackendReviewReport[]>> {
  const reported = items.filter((item) => item.ReviewReport.length > 0);
  const details = await Promise.allSettled(
    reported.map((item) =>
      backendGetAdminReview(apiClient, item.type, item.id),
    ),
  );

  const reports = new Map<string, BackendReviewReport[]>();
  for (const result of details) {
    if (result.status === 'fulfilled') {
      reports.set(
        reviewKey(result.value),
        result.value.ReviewReport.filter((report) => report.status === 'OPEN'),
      );
    }
  }
  return reports;
}

function ReviewContent({ review }: { review: Review }) {
  if (review.type === 'product') {
    return (
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">
          Product review ·{' '}
          <Link
            href={`/catalog/${review.product.id}`}
            className="hover:underline"
          >
            {review.product.name}
          </Link>
          {review.seller ? ` · sold by ${review.seller.businessName}` : null}
        </p>
        {review.title ? <p className="font-medium">{review.title}</p> : null}
        <p className="text-sm whitespace-pre-line text-pretty">{review.body}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">
        Seller rating ·{' '}
        <Link href={`/sellers/${review.seller.id}`} className="hover:underline">
          {review.seller.businessName}
        </Link>
      </p>
      {review.comment ? (
        <p className="text-sm whitespace-pre-line text-pretty">
          {review.comment}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm italic">
          Rated without a comment.
        </p>
      )}
    </div>
  );
}

export default async function ModerationPage({
  searchParams,
}: PageProps<'/moderation'>) {
  await requireAdmin(true);
  const params = await searchParams;
  const filters = readModerationFilters(params);

  let page;
  try {
    page = await backendListAdminReviews(
      apiClient,
      toAdminReviewQuery(filters),
    );
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Moderation"
          description="Customer reviews and seller ratings, and the reports against them."
        />
        <ApiErrorNotice
          error={explainMissingRoute(error, 'review moderation')}
        />
      </div>
    );
  }

  const reports = await openReportsFor(page.items);
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit));
  const isFiltered = isModerationFiltered(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Moderation"
        description="Customer reviews and seller ratings, and the reports against them. Hiding takes a review off the storefront and can be undone; removing is final. Every decision needs a reason except an approval, and is recorded against the review."
      />

      <form className="flex flex-wrap items-end gap-2" action="/moderation">
        <label htmlFor="moderation-type" className="sr-only">
          Kind
        </label>
        <SelectField
          id="moderation-type"
          name="type"
          placeholder="Reviews and ratings"
          defaultValue={filters.type ?? ''}
          options={backendReviewTargetSchema.options.map((value) => ({
            value,
            label: value === 'product' ? 'Product reviews' : 'Seller ratings',
          }))}
        />
        <label htmlFor="moderation-visibility" className="sr-only">
          Visibility
        </label>
        <SelectField
          id="moderation-visibility"
          name="visibility"
          placeholder="Any visibility"
          defaultValue={filters.visibility ?? ''}
          options={reviewVisibilities.map((value) => ({
            value,
            label: humanize(value),
          }))}
        />
        <label htmlFor="moderation-state" className="sr-only">
          Moderation state
        </label>
        <SelectField
          id="moderation-state"
          name="moderationState"
          placeholder="Any moderation state"
          defaultValue={filters.moderationState ?? ''}
          options={reviewModerationStates.map((value) => ({
            value,
            label: humanize(value),
          }))}
        />
        <label htmlFor="moderation-reported" className="sr-only">
          Reports
        </label>
        <SelectField
          id="moderation-reported"
          name="reported"
          placeholder="Reported or not"
          defaultValue={
            filters.hasOpenReport === undefined
              ? ''
              : filters.hasOpenReport
                ? 'yes'
                : 'no'
          }
          options={[
            { value: 'yes', label: 'Has an open report' },
            { value: 'no', label: 'No open report' },
          ]}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/moderation">Clear</Link>
          </Button>
        ) : null}
      </form>

      {page.items.length === 0 ? (
        <EmptyState
          title={
            isFiltered ? 'Nothing matches these filters' : 'Nothing to moderate'
          }
          description={
            isFiltered
              ? 'No review or rating is in that state right now.'
              : 'Reviews and ratings appear here once customers leave them on delivered orders.'
          }
          action={
            isFiltered ? (
              <Button asChild>
                <Link href="/moderation">Clear filters</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-3">
          {page.items.map((review) => {
            const openReports = reports.get(reviewKey(review));
            return (
              <li
                key={reviewKey(review)}
                className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="text-sm font-medium tabular-nums"
                      aria-label={`${review.rating} out of 5`}
                    >
                      {'★'.repeat(review.rating)}
                      <span className="text-muted-foreground">
                        {'★'.repeat(5 - review.rating)}
                      </span>
                    </span>
                    <StatusBadge status={review.visibility.toLowerCase()} />
                    <StatusBadge
                      status={review.moderationState.toLowerCase()}
                    />
                    {review.ReviewReport.length > 0 ? (
                      <span className="text-destructive text-xs font-medium">
                        {review.ReviewReport.length} open{' '}
                        {review.ReviewReport.length === 1
                          ? 'report'
                          : 'reports'}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground text-xs">
                      {formatDate(review.createdAt)}
                    </span>
                  </div>

                  <ReviewContent review={review} />

                  {review.ReviewReport.length > 0 ? (
                    <ul className="space-y-3 border-t pt-3">
                      {(
                        openReports ??
                        review.ReviewReport.map((report) => ({
                          id: report.id,
                          reason: null,
                          details: null,
                          createdAt: null,
                        }))
                      ).map((report) => (
                        <li key={report.id} className="space-y-2">
                          <p className="text-sm">
                            {report.reason ? (
                              <span className="font-medium">
                                {humanize(report.reason)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground font-mono text-xs">
                                Report {report.id.slice(0, 8)}
                              </span>
                            )}
                            {report.createdAt ? (
                              <span className="text-muted-foreground text-xs">
                                {' '}
                                · {formatDate(report.createdAt)}
                              </span>
                            ) : null}
                          </p>
                          {report.details ? (
                            <p className="text-muted-foreground text-sm text-pretty">
                              {report.details}
                            </p>
                          ) : null}
                          <DismissReportForm
                            action={dismissReportAction.bind(
                              null,
                              report.id,
                              randomUUID(),
                            )}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <ModerationDecisionForm
                  action={moderateReviewAction.bind(
                    null,
                    review.type,
                    review.id,
                    randomUUID(),
                  )}
                  version={review.version}
                  decisions={moderationDecisionsFor(
                    review.visibility,
                    review.moderationState,
                  )}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        pathname="/moderation"
        params={params}
        page={page.page}
        pageSize={page.limit}
        total={page.total}
        totalPages={totalPages}
      />
    </div>
  );
}
