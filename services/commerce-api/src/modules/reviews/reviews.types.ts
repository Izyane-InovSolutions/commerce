export type ProductReviewEligibilityView = {
  orderItemId: string;
  eligible: boolean;
  reason?: string;
  alreadyReviewed: boolean;
};

export type SellerRatingEligibilityView = {
  sellerOrderId: string;
  sellerId: string;
  eligible: boolean;
  reason?: string;
  alreadyRated: boolean;
};

export type OrderReviewEligibilityView = {
  orderId: string;
  products: ProductReviewEligibilityView[];
  sellerOrders: SellerRatingEligibilityView[];
};

import type { ProductReview, SellerRating } from '@prisma/client';

export type OwnReviewItem =
  | ({ kind: 'PRODUCT_REVIEW' } & ProductReview)
  | ({ kind: 'SELLER_RATING' } & SellerRating);

export type OwnReviewsPage = {
  items: OwnReviewItem[];
  total: number;
  page: number;
  limit: number;
};
