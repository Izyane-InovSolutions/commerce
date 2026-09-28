import { apiClient } from './api';
import type { SuccessEnvelope } from './catalog-types';
import type {
  OrderReviewEligibility,
  OwnReviewsPage,
  ProductReview,
  ReviewKind,
  ReviewReportReason,
  SellerRating,
} from './review-types';

/**
 * Writing reviews: a product review per delivered order line, and a seller
 * rating per seller group of an order. Reading the public review lists is the
 * product and storefront pages' business, not this module's.
 *
 * Every write except a first submission requires an idempotency key; edits
 * also carry the `version` the shopper was editing, so two tabs cannot
 * silently overwrite each other.
 */

const PATHS: Record<ReviewKind, string> = {
  product: '/reviews/products',
  seller: '/reviews/sellers',
};

/** What in one order can be reviewed now, and what already has been. */
export async function getReviewEligibility(
  orderId: string,
): Promise<OrderReviewEligibility> {
  const response = await apiClient.get<SuccessEnvelope<OrderReviewEligibility>>(
    '/reviews/eligibility',
    { query: { orderId }, cache: 'no-store' },
  );
  return response.data;
}

/** The caller's own reviews and ratings, newest first, whatever their state. */
export async function listOwnReviews(
  page = 1,
  limit = 20,
): Promise<OwnReviewsPage> {
  const response = await apiClient.get<SuccessEnvelope<OwnReviewsPage>>(
    '/reviews/me',
    { query: { page, limit }, cache: 'no-store' },
  );
  return response.data;
}

export async function submitProductReview(input: {
  orderItemId: string;
  rating: number;
  title?: string;
  body: string;
}): Promise<ProductReview> {
  const response = await apiClient.post<SuccessEnvelope<ProductReview>>(
    PATHS.product,
    { body: input },
  );
  return response.data;
}

export async function submitSellerRating(input: {
  sellerOrderId: string;
  rating: number;
  comment?: string;
}): Promise<SellerRating> {
  const response = await apiClient.post<SuccessEnvelope<SellerRating>>(
    PATHS.seller,
    { body: input },
  );
  return response.data;
}

export type ReviewEdit =
  | { kind: 'product'; rating?: number; title?: string; body?: string }
  | { kind: 'seller'; rating?: number; comment?: string };

export async function editReview(
  id: string,
  version: number,
  edit: ReviewEdit,
  idempotencyKey: string,
): Promise<void> {
  const { kind, ...fields } = edit;
  await apiClient.patch(`${PATHS[kind]}/${id}`, {
    body: { version, ...fields },
    idempotencyKey,
  });
}

/** Takes a review down for good; the API keeps it, marked withdrawn. */
export async function withdrawReview(
  kind: ReviewKind,
  id: string,
  idempotencyKey: string,
): Promise<void> {
  await apiClient.delete(`${PATHS[kind]}/${id}`, { idempotencyKey });
}

/** Flags someone else's review for moderation. */
export async function reportReview(
  kind: ReviewKind,
  id: string,
  report: { reason: ReviewReportReason; details?: string },
  idempotencyKey: string,
): Promise<void> {
  await apiClient.post(`${PATHS[kind]}/${id}/reports`, {
    body: report,
    idempotencyKey,
  });
}
