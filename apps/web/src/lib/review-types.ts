/**
 * Local mirror of the Commerce API's customer review shapes
 * (`services/commerce-api/src/modules/reviews`), and the limits its DTOs
 * enforce — kept apart from `reviews.ts` so client forms can use them.
 */

/** Which of the two things a customer can review: a product they bought,
 * or the seller who sent it. The API keeps them in separate tables and
 * routes (`reviews/products`, `reviews/sellers`). */
export type ReviewKind = 'product' | 'seller';

export type ReviewVisibility = 'PUBLISHED' | 'HIDDEN' | 'REMOVED' | 'WITHDRAWN';
export type ReviewModerationState = 'PENDING' | 'APPROVED' | 'FLAGGED';

export type ProductReviewEligibility = {
  orderItemId: string;
  eligible: boolean;
  reason?: string;
  alreadyReviewed: boolean;
};

export type SellerRatingEligibility = {
  sellerOrderId: string;
  sellerId: string;
  eligible: boolean;
  reason?: string;
  alreadyRated: boolean;
};

/** `GET /reviews/eligibility?orderId=` — per line and per seller group. */
export type OrderReviewEligibility = {
  orderId: string;
  products: ProductReviewEligibility[];
  sellerOrders: SellerRatingEligibility[];
};

type ReviewBase = {
  id: string;
  authorUserId: string;
  sellerId: string | null;
  rating: number;
  visibility: ReviewVisibility;
  moderationState: ReviewModerationState;
  /** Optimistic-concurrency counter — sent back with every edit. */
  version: number;
  /** After this, the API refuses edits. */
  editDeadline: string;
  deliveredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductReview = ReviewBase & {
  orderItemId: string;
  productId: string;
  variantId: string;
  offerId: string;
  title: string | null;
  body: string;
};

export type SellerRating = ReviewBase & {
  sellerOrderId: string;
  sellerId: string;
  comment: string | null;
};

/** One entry of `GET /reviews/me`, tagged with which kind it is. */
export type OwnReview =
  | ({ kind: 'PRODUCT_REVIEW' } & ProductReview)
  | ({ kind: 'SELLER_RATING' } & SellerRating);

export type OwnReviewsPage = {
  items: OwnReview[];
  total: number;
  page: number;
  limit: number;
};

export type ReviewReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'HATEFUL_CONTENT'
  | 'PERSONAL_INFORMATION'
  | 'OFF_TOPIC'
  | 'FRAUD'
  | 'OTHER';

export const REPORT_REASON_LABELS: Record<ReviewReportReason, string> = {
  SPAM: 'Spam or advertising',
  HARASSMENT: 'Harassment',
  HATEFUL_CONTENT: 'Hateful content',
  PERSONAL_INFORMATION: 'Shares personal information',
  OFF_TOPIC: 'Not about this product or seller',
  FRAUD: 'Fraud or a scam',
  OTHER: 'Something else',
};

export const REPORT_REASONS = Object.keys(
  REPORT_REASON_LABELS,
) as ReviewReportReason[];

/** The DTO limits, so a form can say so before the API does. */
export const REVIEW_LIMITS = {
  titleMax: 120,
  bodyMin: 10,
  bodyMax: 2000,
  commentMax: 2000,
  reportDetailsMax: 2000,
} as const;

/** Not withdrawn or removed by moderation — the API refuses edits and
 * withdrawals of those, whatever the deadline. */
function isLive(review: Pick<ReviewBase, 'visibility'>): boolean {
  return review.visibility === 'PUBLISHED' || review.visibility === 'HIDDEN';
}

/** Still editable: live, and inside the edit window. */
export function isReviewEditable(
  review: Pick<ReviewBase, 'visibility' | 'editDeadline'>,
  now: Date = new Date(),
): boolean {
  return (
    isLive(review) && new Date(review.editDeadline).getTime() >= now.getTime()
  );
}

/** Withdrawing has no deadline, only the same "still live" rule. */
export function isReviewWithdrawable(
  review: Pick<ReviewBase, 'visibility'>,
): boolean {
  return isLive(review);
}
