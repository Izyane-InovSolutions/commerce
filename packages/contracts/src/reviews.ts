import { z } from 'zod';

const id = z.uuid();
const date = z.iso.datetime();
const filterDate = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true, local: true }),
]);
const count = z.int().nonnegative();
const stars = z.int().min(1).max(5);
export const backendReviewVisibilitySchema = z.enum([
  'PUBLISHED',
  'HIDDEN',
  'REMOVED',
  'WITHDRAWN',
]);
export const backendReviewModerationStateSchema = z.enum([
  'PENDING',
  'APPROVED',
  'FLAGGED',
]);
export const backendReviewReportReasonSchema = z.enum([
  'SPAM',
  'HARASSMENT',
  'HATEFUL_CONTENT',
  'PERSONAL_INFORMATION',
  'OFF_TOPIC',
  'FRAUD',
  'OTHER',
]);
export const backendReviewReportStatusSchema = z.enum([
  'OPEN',
  'DISMISSED',
  'ACTIONED',
]);
export const backendReviewTargetSchema = z.enum(['product', 'seller']);
export type BackendReviewTarget = z.infer<typeof backendReviewTargetSchema>;

export const backendRatingSummarySchema = z.object({
  averageRating: z.number().min(1).max(5).nullable(),
  ratingCount: count,
  ratingHistogram: z.object({
    1: count,
    2: count,
    3: count,
    4: count,
    5: count,
  }),
});
export type BackendRatingSummary = z.infer<typeof backendRatingSummarySchema>;
export const backendPublicStorefrontSchema = backendRatingSummarySchema.extend({
  id,
  storefrontSlug: z.string().nullable(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
});
export type BackendPublicStorefront = z.infer<
  typeof backendPublicStorefrontSchema
>;
export type BackendOrderReviewEligibility = z.infer<
  typeof backendOrderReviewEligibilitySchema
>;
export type BackendReviewReport = z.infer<typeof backendReviewReportSchema>;
export type BackendReviewReportDismissal = z.infer<
  typeof backendReviewReportDismissalSchema
>;
export type BackendPublicProductReviewsPage = z.infer<
  typeof backendPublicProductReviewsPageSchema
>;
export type BackendPublicSellerRatingsPage = z.infer<
  typeof backendPublicSellerRatingsPageSchema
>;
export type BackendSellerReviewsPage = z.infer<
  typeof backendSellerReviewsPageSchema
>;
export type BackendSellerRatingsPage = z.infer<
  typeof backendSellerRatingsPageSchema
>;
export type BackendOwnReviewsPage = z.infer<typeof backendOwnReviewsPageSchema>;
export type BackendAdminReviewsPage = z.infer<
  typeof backendAdminReviewsPageSchema
>;

const productLabel = z.object({ id, name: z.string(), slug: z.string() });
const sellerLabel = z.object({
  id,
  displayName: z.string().nullable(),
  businessName: z.string(),
});
const publicBase = z.object({
  id,
  rating: stars,
  reviewerLabel: z.string(),
  verifiedPurchase: z.literal(true),
  createdAt: date,
  updatedAt: date,
});
export const backendPublicProductReviewSchema = publicBase.extend({
  title: z.string().nullable(),
  body: z.string(),
  product: productLabel,
  seller: z.object({ id, displayName: z.string().nullable() }).nullable(),
});
export const backendPublicSellerRatingSchema = publicBase.extend({
  comment: z.string().nullable(),
});
export type BackendPublicProductReview = z.infer<
  typeof backendPublicProductReviewSchema
>;
export type BackendPublicSellerRating = z.infer<
  typeof backendPublicSellerRatingSchema
>;

// Customer/admin records are intentionally separate from public/seller projections.
const ownedBase = z.object({
  id,
  authorUserId: id,
  rating: stars,
  deliveredAt: date,
  verifiedAt: date,
  visibility: backendReviewVisibilitySchema,
  moderationState: backendReviewModerationStateSchema,
  version: count,
  editDeadline: date,
  createdAt: date,
  updatedAt: date,
});
export const backendProductReviewSchema = ownedBase.extend({
  orderItemId: id,
  productId: id,
  variantId: id,
  offerId: id,
  sellerId: id.nullable(),
  title: z.string().nullable(),
  body: z.string(),
});
export const backendSellerRatingSchema = ownedBase.extend({
  sellerOrderId: id,
  sellerId: id,
  comment: z.string().nullable(),
});
export type BackendProductReview = z.infer<typeof backendProductReviewSchema>;
export type BackendSellerRating = z.infer<typeof backendSellerRatingSchema>;
export const backendOwnReviewSchema = z.discriminatedUnion('kind', [
  backendProductReviewSchema.extend({ kind: z.literal('PRODUCT_REVIEW') }),
  backendSellerRatingSchema.extend({ kind: z.literal('SELLER_RATING') }),
]);

export const backendOrderReviewEligibilitySchema = z.object({
  orderId: id,
  products: z.array(
    z.object({
      orderItemId: id,
      eligible: z.boolean(),
      reason: z.string().optional(),
      alreadyReviewed: z.boolean(),
    }),
  ),
  sellerOrders: z.array(
    z.object({
      sellerOrderId: id,
      sellerId: id,
      eligible: z.boolean(),
      reason: z.string().optional(),
      alreadyRated: z.boolean(),
    }),
  ),
});

export const backendSubmitProductReviewInputSchema = z.object({
  orderItemId: id,
  rating: stars,
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(10).max(2000),
});
export const backendSubmitSellerRatingInputSchema = z.object({
  sellerOrderId: id,
  rating: stars,
  comment: z.string().trim().max(2000).optional(),
});
export const backendEditProductReviewInputSchema =
  backendSubmitProductReviewInputSchema
    .omit({ orderItemId: true })
    .partial()
    .extend({ version: count });
export const backendEditSellerRatingInputSchema =
  backendSubmitSellerRatingInputSchema
    .omit({ sellerOrderId: true })
    .partial()
    .extend({ version: count });
export const backendReportReviewInputSchema = z.object({
  reason: backendReviewReportReasonSchema,
  details: z.string().trim().max(2000).optional(),
});
export const backendApproveReviewInputSchema = z.object({ version: count });
export const backendModerateReviewInputSchema =
  backendApproveReviewInputSchema.extend({ reason: z.string().trim().min(1) });
export const backendDismissReviewReportInputSchema = z.object({
  reason: z.string().trim().min(1),
});
export type BackendSubmitProductReviewInput = z.input<
  typeof backendSubmitProductReviewInputSchema
>;
export type BackendSubmitSellerRatingInput = z.input<
  typeof backendSubmitSellerRatingInputSchema
>;
export type BackendEditProductReviewInput = z.input<
  typeof backendEditProductReviewInputSchema
>;
export type BackendEditSellerRatingInput = z.input<
  typeof backendEditSellerRatingInputSchema
>;
export type BackendReportReviewInput = z.input<
  typeof backendReportReviewInputSchema
>;
export type BackendApproveReviewInput = z.input<
  typeof backendApproveReviewInputSchema
>;
export type BackendModerateReviewInput = z.input<
  typeof backendModerateReviewInputSchema
>;
export type BackendDismissReviewReportInput = z.input<
  typeof backendDismissReviewReportInputSchema
>;

export const backendReviewReportSchema = z.object({
  id,
  productReviewId: id.nullable(),
  sellerRatingId: id.nullable(),
  reporterUserId: id,
  reason: backendReviewReportReasonSchema,
  details: z.string().nullable(),
  status: backendReviewReportStatusSchema,
  resolvedByUserId: id.nullable(),
  resolutionNote: z.string().nullable(),
  resolvedAt: date.nullable(),
  createdAt: date,
});
const sellerFeedBase = z.object({
  id,
  rating: stars,
  reviewerLabel: z.string(),
  visibility: backendReviewVisibilitySchema,
  moderationState: backendReviewModerationStateSchema,
  createdAt: date,
  updatedAt: date,
  deliveredAt: date,
  hasOpenReport: z.boolean(),
});
export const backendSellerReviewViewSchema = sellerFeedBase.extend({
  title: z.string().nullable(),
  body: z.string(),
  product: productLabel,
});
export const backendSellerRatingViewSchema = sellerFeedBase.extend({
  comment: z.string().nullable(),
});

const revisionBase = z.object({
  id,
  revisionNumber: count,
  rating: stars,
  authorUserId: id,
  source: z.enum(['SUBMISSION', 'CUSTOMER_EDIT']),
  reason: z.string().nullable(),
  createdAt: date,
});
export const backendProductReviewRevisionSchema = revisionBase.extend({
  productReviewId: id,
  title: z.string().nullable(),
  body: z.string(),
});
export const backendSellerRatingRevisionSchema = revisionBase.extend({
  sellerRatingId: id,
  comment: z.string().nullable(),
});
export const backendReviewModerationEventSchema = z.object({
  id,
  targetType: z.enum(['PRODUCT_REVIEW', 'SELLER_RATING']),
  targetId: id,
  action: z.enum([
    'SUBMITTED',
    'EDITED',
    'REPORTED',
    'APPROVED',
    'HIDDEN',
    'REMOVED',
    'RESTORED',
    'WITHDRAWN',
    'REPORT_DISMISSED',
  ]),
  actorUserId: id.nullable(),
  reason: z.string().nullable(),
  previousVisibility: backendReviewVisibilitySchema.nullable(),
  resultingVisibility: backendReviewVisibilitySchema.nullable(),
  previousModerationState: backendReviewModerationStateSchema.nullable(),
  resultingModerationState: backendReviewModerationStateSchema.nullable(),
  idempotencyKey: z.string().nullable(),
  requestHash: z.string().nullable(),
  createdAt: date,
});
const adminProduct = backendProductReviewSchema.extend({
  type: z.literal('product'),
  product: productLabel,
  seller: sellerLabel.nullable(),
});
const adminSeller = backendSellerRatingSchema.extend({
  type: z.literal('seller'),
  seller: sellerLabel,
});
const reportIds = z.array(z.object({ id }));
export const backendAdminReviewListItemSchema = z.discriminatedUnion('type', [
  adminProduct.extend({ ReviewReport: reportIds }),
  adminSeller.extend({ ReviewReport: reportIds }),
]);
const detail = {
  ReviewReport: z.array(backendReviewReportSchema),
  author: z.object({
    id,
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  }),
  moderationEvents: z.array(backendReviewModerationEventSchema),
};
export const backendAdminReviewDetailSchema = z.discriminatedUnion('type', [
  adminProduct.extend({
    ...detail,
    orderItem: z.object({ id, orderId: id }),
    revisions: z.array(backendProductReviewRevisionSchema),
  }),
  adminSeller.extend({
    ...detail,
    sellerOrder: z.object({ id, orderId: id }),
    revisions: z.array(backendSellerRatingRevisionSchema),
  }),
]);
export const backendReviewReportDismissalSchema = z.object({
  report: backendReviewReportSchema,
  target: backendAdminReviewDetailSchema,
});
export type BackendAdminReviewDetail = z.infer<
  typeof backendAdminReviewDetailSchema
>;

export const backendReviewPaginationQuerySchema = z.object({
  page: z.int().min(1).optional(),
  limit: z.int().min(1).max(100).optional(),
});
export const backendPublicReviewQuerySchema =
  backendReviewPaginationQuerySchema.extend({
    rating: stars.optional(),
    sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).optional(),
  });
export const backendSellerReviewQuerySchema =
  backendReviewPaginationQuerySchema.extend({
    rating: stars.optional(),
    visibility: backendReviewVisibilitySchema.optional(),
    moderationState: backendReviewModerationStateSchema.optional(),
    reported: z.boolean().optional(),
    dateFrom: filterDate.optional(),
    dateTo: filterDate.optional(),
  });
export const backendAdminReviewQuerySchema =
  backendReviewPaginationQuerySchema.extend({
    type: backendReviewTargetSchema.optional(),
    moderationState: backendReviewModerationStateSchema.optional(),
    visibility: backendReviewVisibilitySchema.optional(),
    hasOpenReport: z.boolean().optional(),
    rating: stars.optional(),
    productId: id.optional(),
    sellerId: id.optional(),
    createdFrom: filterDate.optional(),
    createdTo: filterDate.optional(),
    updatedFrom: filterDate.optional(),
    updatedTo: filterDate.optional(),
  });
export type BackendReviewPaginationQuery = z.input<
  typeof backendReviewPaginationQuerySchema
>;
export type BackendPublicReviewQuery = z.input<
  typeof backendPublicReviewQuerySchema
>;
export type BackendSellerReviewQuery = z.input<
  typeof backendSellerReviewQuerySchema
>;
export type BackendAdminReviewQuery = z.input<
  typeof backendAdminReviewQuerySchema
>;

// Public/seller feeds use data/meta. Customer/admin queues use items/total.
const meta = z.object({
  page: z.int().min(1),
  limit: z.int().min(1),
  total: count,
});
export const backendPublicProductReviewsPageSchema = z.object({
  data: z.array(backendPublicProductReviewSchema),
  meta,
});
export const backendPublicSellerRatingsPageSchema = z.object({
  data: z.array(backendPublicSellerRatingSchema),
  meta,
});
export const backendSellerReviewsPageSchema = z.object({
  data: z.array(backendSellerReviewViewSchema),
  meta,
});
export const backendSellerRatingsPageSchema = z.object({
  data: z.array(backendSellerRatingViewSchema),
  meta,
});
export const backendOwnReviewsPageSchema = z.object({
  items: z.array(backendOwnReviewSchema),
  ...meta.shape,
});
export const backendAdminReviewsPageSchema = z.object({
  items: z.array(backendAdminReviewListItemSchema),
  ...meta.shape,
});
