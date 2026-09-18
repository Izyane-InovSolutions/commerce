import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReviewModerationState,
  ReviewReportStatus,
  ReviewVisibility,
} from '@prisma/client';

import {
  PaginatedResult,
  paginatedResult,
} from '../../common/pagination/paginated-result';
import { PrismaService } from '../../database/prisma.service';
import { formatReviewerLabel } from '../reviews/reviewer-label';
import { SellerReviewFilterDto } from './dto/seller-review-filter.dto';

// Seller-facing projection: full text/rating (this is the seller's own sales
// feedback, not redacted like the public read) plus moderation status, since
// sellers need to know if something is hidden/flagged — unlike the public
// read, which only ever shows PUBLISHED rows. Never includes authorUserId,
// report content (details/reporter identity), admin notes, or full order
// detail — only an aggregate `hasOpenReport` flag.
const SELLER_PRODUCT_REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  visibility: true,
  moderationState: true,
  createdAt: true,
  updatedAt: true,
  deliveredAt: true,
  author: { select: { firstName: true, lastName: true } },
  product: { select: { id: true, name: true, slug: true } },
  _count: {
    select: { ReviewReport: { where: { status: ReviewReportStatus.OPEN } } },
  },
} satisfies Prisma.ProductReviewSelect;

const SELLER_RATING_SELECT = {
  id: true,
  rating: true,
  comment: true,
  visibility: true,
  moderationState: true,
  createdAt: true,
  updatedAt: true,
  deliveredAt: true,
  author: { select: { firstName: true, lastName: true } },
  _count: {
    select: { ReviewReport: { where: { status: ReviewReportStatus.OPEN } } },
  },
} satisfies Prisma.SellerRatingSelect;

export type SellerReviewView = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  reviewerLabel: string;
  visibility: ReviewVisibility;
  moderationState: ReviewModerationState;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date;
  hasOpenReport: boolean;
  product: { id: string; name: string; slug: string };
};

export type SellerRatingView = {
  id: string;
  rating: number;
  comment: string | null;
  reviewerLabel: string;
  visibility: ReviewVisibility;
  moderationState: ReviewModerationState;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date;
  hasOpenReport: boolean;
};

@Injectable()
export class SellerReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listReviews(
    sellerId: string,
    query: SellerReviewFilterDto,
  ): Promise<PaginatedResult<SellerReviewView>> {
    const where: Prisma.ProductReviewWhereInput = {
      sellerId,
      ...this.commonFilters(query),
    };

    const [rows, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: SELLER_PRODUCT_REVIEW_SELECT,
      }),
      this.prisma.productReview.count({ where }),
    ]);

    return paginatedResult(
      rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        title: row.title,
        body: row.body,
        reviewerLabel: formatReviewerLabel(
          row.author.firstName,
          row.author.lastName,
        ),
        visibility: row.visibility,
        moderationState: row.moderationState,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deliveredAt: row.deliveredAt,
        hasOpenReport: row._count.ReviewReport > 0,
        product: row.product,
      })),
      query.page,
      query.limit,
      total,
    );
  }

  async listRatings(
    sellerId: string,
    query: SellerReviewFilterDto,
  ): Promise<PaginatedResult<SellerRatingView>> {
    const where: Prisma.SellerRatingWhereInput = {
      sellerId,
      ...this.commonFilters(query),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sellerRating.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: SELLER_RATING_SELECT,
      }),
      this.prisma.sellerRating.count({ where }),
    ]);

    return paginatedResult(
      rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        reviewerLabel: formatReviewerLabel(
          row.author.firstName,
          row.author.lastName,
        ),
        visibility: row.visibility,
        moderationState: row.moderationState,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deliveredAt: row.deliveredAt,
        hasOpenReport: row._count.ReviewReport > 0,
      })),
      query.page,
      query.limit,
      total,
    );
  }

  /** Filters that apply identically to ProductReview and SellerRating rows. */
  private commonFilters(
    query: SellerReviewFilterDto,
  ): Prisma.ProductReviewWhereInput & Prisma.SellerRatingWhereInput {
    const where: Prisma.ProductReviewWhereInput &
      Prisma.SellerRatingWhereInput = {};

    if (query.rating) where.rating = query.rating;
    if (query.visibility) where.visibility = query.visibility;
    if (query.moderationState) where.moderationState = query.moderationState;

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    if (query.reported !== undefined) {
      where.ReviewReport = query.reported
        ? { some: { status: ReviewReportStatus.OPEN } }
        : { none: { status: ReviewReportStatus.OPEN } };
    }

    return where;
  }
}
