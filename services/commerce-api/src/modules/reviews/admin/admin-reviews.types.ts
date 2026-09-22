import { Prisma, ReviewModerationState, ReviewVisibility } from '@prisma/client';

/** URL/query-facing discriminator — see dto/list-admin-reviews.dto.ts. */
export type AdminReviewTargetParam = 'product' | 'seller';

/** The subset of ProductReview/SellerRating fields every moderation
 * transition needs, common to both tables. */
export type ModeratableRecord = {
  id: string;
  authorUserId: string;
  visibility: ReviewVisibility;
  moderationState: ReviewModerationState;
  version: number;
};

export const PRODUCT_REVIEW_LIST_INCLUDE = {
  product: { select: { id: true, name: true, slug: true } },
  seller: { select: { id: true, displayName: true, businessName: true } },
  ReviewReport: {
    where: { status: 'OPEN' },
    select: { id: true },
  },
} satisfies Prisma.ProductReviewInclude;

export const SELLER_RATING_LIST_INCLUDE = {
  seller: { select: { id: true, displayName: true, businessName: true } },
  ReviewReport: {
    where: { status: 'OPEN' },
    select: { id: true },
  },
} satisfies Prisma.SellerRatingInclude;

export const PRODUCT_REVIEW_DETAIL_INCLUDE = {
  revisions: { orderBy: { revisionNumber: 'desc' } },
  ReviewReport: { orderBy: { createdAt: 'desc' } },
  product: { select: { id: true, name: true, slug: true } },
  seller: { select: { id: true, displayName: true, businessName: true } },
  author: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
  orderItem: { select: { id: true, orderId: true } },
} satisfies Prisma.ProductReviewInclude;

export const SELLER_RATING_DETAIL_INCLUDE = {
  revisions: { orderBy: { revisionNumber: 'desc' } },
  ReviewReport: { orderBy: { createdAt: 'desc' } },
  seller: { select: { id: true, displayName: true, businessName: true } },
  author: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
  sellerOrder: { select: { id: true, orderId: true } },
} satisfies Prisma.SellerRatingInclude;

export type ProductReviewWithList = Prisma.ProductReviewGetPayload<{
  include: typeof PRODUCT_REVIEW_LIST_INCLUDE;
}>;
export type SellerRatingWithList = Prisma.SellerRatingGetPayload<{
  include: typeof SELLER_RATING_LIST_INCLUDE;
}>;
export type ProductReviewWithDetail = Prisma.ProductReviewGetPayload<{
  include: typeof PRODUCT_REVIEW_DETAIL_INCLUDE;
}>;
export type SellerRatingWithDetail = Prisma.SellerRatingGetPayload<{
  include: typeof SELLER_RATING_DETAIL_INCLUDE;
}>;

/** One row of the unified GET /admin/reviews queue — `type` discriminates
 * which table it came from; fields not applicable to a type are omitted. */
export type AdminReviewListItem =
  | ({ type: 'product' } & ProductReviewWithList)
  | ({ type: 'seller' } & SellerRatingWithList);

export type AdminReviewPage = {
  items: AdminReviewListItem[];
  total: number;
  page: number;
  limit: number;
};

export type AdminReviewReportDismissal = {
  report: Prisma.ReviewReportGetPayload<object>;
  target: AdminReviewDetail;
};

export type AdminReviewDetail =
  | ({ type: 'product' } & ProductReviewWithDetail & {
        moderationEvents: Prisma.ReviewModerationEventGetPayload<object>[];
      })
  | ({ type: 'seller' } & SellerRatingWithDetail & {
        moderationEvents: Prisma.ReviewModerationEventGetPayload<object>[];
      });
