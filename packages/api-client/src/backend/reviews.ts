import * as c from '@commerce/contracts';
import type { ApiClient, QueryValue } from '../client.ts';

type Parser<T> = { parse(value: unknown): T };
// Handle either client envelope setting, preserving nested data/meta pagination.
function parseResponse<T>(schema: Parser<T>, value: unknown): T {
  if (
    value &&
    typeof value === 'object' &&
    'meta' in value &&
    'data' in value
  ) {
    const meta = value.meta;
    if (meta && typeof meta === 'object' && 'requestId' in meta)
      return schema.parse(value.data);
  }
  return schema.parse(value);
}
function read<T>(
  client: ApiClient,
  path: string,
  schema: Parser<T>,
  query?: Record<string, QueryValue>,
): Promise<T> {
  return client
    .get<unknown>(path, { query, cache: 'no-store' })
    .then((value) => parseResponse(schema, value));
}
function write<T>(
  client: ApiClient,
  method: 'post' | 'patch' | 'delete',
  path: string,
  schema: Parser<T>,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  return client[method]<unknown>(path, { body, idempotencyKey }).then((value) =>
    parseResponse(schema, value),
  );
}
const segment = encodeURIComponent;

export function backendListProductReviews(
  client: ApiClient,
  slug: string,
  query: c.BackendPublicReviewQuery = {},
): Promise<c.BackendPublicProductReviewsPage> {
  return read(
    client,
    `/catalog/products/${segment(slug)}/reviews`,
    c.backendPublicProductReviewsPageSchema,
    c.backendPublicReviewQuerySchema.parse(query),
  );
}
export function backendGetPublicStorefront(
  client: ApiClient,
  slug: string,
): Promise<c.BackendPublicStorefront> {
  return read(
    client,
    `/storefronts/${segment(slug)}`,
    c.backendPublicStorefrontSchema,
  );
}
export function backendListStorefrontRatings(
  client: ApiClient,
  slug: string,
  query: c.BackendPublicReviewQuery = {},
): Promise<c.BackendPublicSellerRatingsPage> {
  return read(
    client,
    `/storefronts/${segment(slug)}/ratings`,
    c.backendPublicSellerRatingsPageSchema,
    c.backendPublicReviewQuerySchema.parse(query),
  );
}
export function backendGetOrderReviewEligibility(
  client: ApiClient,
  orderId: string,
): Promise<c.BackendOrderReviewEligibility> {
  return read(
    client,
    '/reviews/eligibility',
    c.backendOrderReviewEligibilitySchema,
    { orderId },
  );
}
export function backendListOwnReviews(
  client: ApiClient,
  query: c.BackendReviewPaginationQuery = {},
): Promise<c.BackendOwnReviewsPage> {
  return read(
    client,
    '/reviews/me',
    c.backendOwnReviewsPageSchema,
    c.backendReviewPaginationQuerySchema.parse(query),
  );
}
export function backendSubmitProductReview(
  client: ApiClient,
  input: c.BackendSubmitProductReviewInput,
): Promise<c.BackendProductReview> {
  return write(
    client,
    'post',
    '/reviews/products',
    c.backendProductReviewSchema,
    c.backendSubmitProductReviewInputSchema.parse(input),
  );
}
export function backendSubmitSellerRating(
  client: ApiClient,
  input: c.BackendSubmitSellerRatingInput,
): Promise<c.BackendSellerRating> {
  return write(
    client,
    'post',
    '/reviews/sellers',
    c.backendSellerRatingSchema,
    c.backendSubmitSellerRatingInputSchema.parse(input),
  );
}
export function backendEditProductReview(
  client: ApiClient,
  id: string,
  input: c.BackendEditProductReviewInput,
  key: string,
): Promise<c.BackendProductReview> {
  return write(
    client,
    'patch',
    `/reviews/products/${segment(id)}`,
    c.backendProductReviewSchema,
    c.backendEditProductReviewInputSchema.parse(input),
    key,
  );
}
export function backendEditSellerRating(
  client: ApiClient,
  id: string,
  input: c.BackendEditSellerRatingInput,
  key: string,
): Promise<c.BackendSellerRating> {
  return write(
    client,
    'patch',
    `/reviews/sellers/${segment(id)}`,
    c.backendSellerRatingSchema,
    c.backendEditSellerRatingInputSchema.parse(input),
    key,
  );
}
export function backendWithdrawProductReview(
  client: ApiClient,
  id: string,
  key: string,
): Promise<c.BackendProductReview> {
  return write(
    client,
    'delete',
    `/reviews/products/${segment(id)}`,
    c.backendProductReviewSchema,
    undefined,
    key,
  );
}
export function backendWithdrawSellerRating(
  client: ApiClient,
  id: string,
  key: string,
): Promise<c.BackendSellerRating> {
  return write(
    client,
    'delete',
    `/reviews/sellers/${segment(id)}`,
    c.backendSellerRatingSchema,
    undefined,
    key,
  );
}
// Sellers report through these same authenticated endpoints; no private report feed is exposed.
export function backendReportProductReview(
  client: ApiClient,
  id: string,
  input: c.BackendReportReviewInput,
  key: string,
): Promise<c.BackendReviewReport> {
  return write(
    client,
    'post',
    `/reviews/products/${segment(id)}/reports`,
    c.backendReviewReportSchema,
    c.backendReportReviewInputSchema.parse(input),
    key,
  );
}
export function backendReportSellerRating(
  client: ApiClient,
  id: string,
  input: c.BackendReportReviewInput,
  key: string,
): Promise<c.BackendReviewReport> {
  return write(
    client,
    'post',
    `/reviews/sellers/${segment(id)}/reports`,
    c.backendReviewReportSchema,
    c.backendReportReviewInputSchema.parse(input),
    key,
  );
}
export function backendListSellerReviews(
  client: ApiClient,
  query: c.BackendSellerReviewQuery = {},
): Promise<c.BackendSellerReviewsPage> {
  return read(
    client,
    '/sellers/me/reviews',
    c.backendSellerReviewsPageSchema,
    c.backendSellerReviewQuerySchema.parse(query),
  );
}
export function backendListSellerRatings(
  client: ApiClient,
  query: c.BackendSellerReviewQuery = {},
): Promise<c.BackendSellerRatingsPage> {
  return read(
    client,
    '/sellers/me/ratings',
    c.backendSellerRatingsPageSchema,
    c.backendSellerReviewQuerySchema.parse(query),
  );
}
export function backendListAdminReviews(
  client: ApiClient,
  query: c.BackendAdminReviewQuery = {},
): Promise<c.BackendAdminReviewsPage> {
  return read(
    client,
    '/admin/reviews',
    c.backendAdminReviewsPageSchema,
    c.backendAdminReviewQuerySchema.parse(query),
  );
}
export function backendGetAdminReview(
  client: ApiClient,
  type: c.BackendReviewTarget,
  id: string,
): Promise<c.BackendAdminReviewDetail> {
  return read(
    client,
    `/admin/reviews/${type}/${segment(id)}`,
    c.backendAdminReviewDetailSchema,
  );
}
export function backendApproveReview(
  client: ApiClient,
  type: c.BackendReviewTarget,
  id: string,
  input: c.BackendApproveReviewInput,
  key: string,
): Promise<c.BackendAdminReviewDetail> {
  return write(
    client,
    'post',
    `/admin/reviews/${type}/${segment(id)}/approve`,
    c.backendAdminReviewDetailSchema,
    c.backendApproveReviewInputSchema.parse(input),
    key,
  );
}
export function backendHideReview(
  client: ApiClient,
  type: c.BackendReviewTarget,
  id: string,
  input: c.BackendModerateReviewInput,
  key: string,
): Promise<c.BackendAdminReviewDetail> {
  return write(
    client,
    'post',
    `/admin/reviews/${type}/${segment(id)}/hide`,
    c.backendAdminReviewDetailSchema,
    c.backendModerateReviewInputSchema.parse(input),
    key,
  );
}
export function backendRemoveReview(
  client: ApiClient,
  type: c.BackendReviewTarget,
  id: string,
  input: c.BackendModerateReviewInput,
  key: string,
): Promise<c.BackendAdminReviewDetail> {
  return write(
    client,
    'post',
    `/admin/reviews/${type}/${segment(id)}/remove`,
    c.backendAdminReviewDetailSchema,
    c.backendModerateReviewInputSchema.parse(input),
    key,
  );
}
export function backendRestoreReview(
  client: ApiClient,
  type: c.BackendReviewTarget,
  id: string,
  input: c.BackendModerateReviewInput,
  key: string,
): Promise<c.BackendAdminReviewDetail> {
  return write(
    client,
    'post',
    `/admin/reviews/${type}/${segment(id)}/restore`,
    c.backendAdminReviewDetailSchema,
    c.backendModerateReviewInputSchema.parse(input),
    key,
  );
}
export function backendDismissReviewReport(
  client: ApiClient,
  id: string,
  input: c.BackendDismissReviewReportInput,
  key: string,
): Promise<c.BackendReviewReportDismissal> {
  return write(
    client,
    'post',
    `/admin/review-reports/${segment(id)}/dismiss`,
    c.backendReviewReportDismissalSchema,
    c.backendDismissReviewReportInputSchema.parse(input),
    key,
  );
}
