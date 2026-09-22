import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReviewVisibility, SellerStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  PaginatedResult,
  paginatedResult,
} from '../../common/pagination/paginated-result';
import { ReviewListQueryDto } from '../reviews/dto/review-list-query.dto';
import { formatReviewerLabel } from '../reviews/reviewer-label';
import {
  averageRatingFromSummary,
  ratingHistogramFromSummary,
  RatingHistogram,
} from '../reviews/rating-summary.util';
import { reviewOrderBy } from '../reviews/review-sort';
import { SellersService } from './sellers.service';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';

export type PublicStorefront = {
  id: string;
  storefrontSlug: string | null;
  displayName: string | null;
  description: string | null;
};

/**
 * The full `GET storefronts/:slug` response — PublicStorefront plus the
 * rating aggregate. Kept separate from PublicStorefront itself since that
 * lighter type is also embedded on marketplace offers (see
 * MarketplaceOffersService), which never needed the aggregate.
 */
export type PublicStorefrontDetail = PublicStorefront & {
  averageRating: number | null;
  ratingCount: number;
  ratingHistogram: RatingHistogram;
};

export const PUBLIC_STOREFRONT_SELECT = {
  id: true,
  storefrontSlug: true,
  displayName: true,
  description: true,
} as const;

const SELLER_RATING_PUBLIC_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { firstName: true, lastName: true } },
} satisfies Prisma.SellerRatingSelect;

export type PublicSellerRating = {
  id: string;
  rating: number;
  comment: string | null;
  reviewerLabel: string;
  verifiedPurchase: true;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class StorefrontsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellers: SellersService,
  ) {}

  async findPublic(slug: string): Promise<PublicStorefrontDetail> {
    const storefront = await this.prisma.seller.findFirst({
      where: {
        storefrontSlug: slug,
        status: SellerStatus.APPROVED,
        ownerUser: { isActive: true },
      },
      select: PUBLIC_STOREFRONT_SELECT,
    });
    if (!storefront) throw new NotFoundException('Storefront not found');
    return this.withRatingAggregate(storefront);
  }

  async findPublicRatings(
    slug: string,
    query: ReviewListQueryDto,
  ): Promise<PaginatedResult<PublicSellerRating>> {
    const seller = await this.prisma.seller.findFirst({
      where: {
        storefrontSlug: slug,
        status: SellerStatus.APPROVED,
        ownerUser: { isActive: true },
      },
      select: { id: true },
    });
    if (!seller) throw new NotFoundException('Storefront not found');

    const where: Prisma.SellerRatingWhereInput = {
      sellerId: seller.id,
      visibility: ReviewVisibility.PUBLISHED,
      ...(query.rating ? { rating: query.rating } : {}),
    };

    const [ratings, total] = await Promise.all([
      this.prisma.sellerRating.findMany({
        where,
        orderBy: reviewOrderBy(query.sort),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: SELLER_RATING_PUBLIC_SELECT,
      }),
      this.prisma.sellerRating.count({ where }),
    ]);

    return paginatedResult(
      ratings.map((rating) => ({
        id: rating.id,
        rating: rating.rating,
        comment: rating.comment,
        reviewerLabel: formatReviewerLabel(
          rating.author.firstName,
          rating.author.lastName,
        ),
        verifiedPurchase: true as const,
        createdAt: rating.createdAt,
        updatedAt: rating.updatedAt,
      })),
      query.page,
      query.limit,
      total,
    );
  }

  async update(
    userId: string,
    dto: UpdateStorefrontDto,
  ): Promise<PublicStorefrontDetail & { version: number }> {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const seller = await this.sellers.lockApproved(userId, tx);
        const { version, ...profile } = dto;
        const result = await tx.seller.updateMany({
          where: { id: seller.id, version },
          data: {
            ...profile,
            displayName: profile.displayName.trim(),
            version: { increment: 1 },
          },
        });
        if (result.count !== 1)
          throw new ConflictException(
            'Storefront changed; reload and try again',
          );
        await tx.auditEvent.create({
          data: {
            actorUserId: userId,
            action: 'seller.storefront_updated',
            targetType: 'Seller',
            targetId: seller.id,
          },
        });
        return tx.seller.findUniqueOrThrow({
          where: { id: seller.id },
          select: { ...PUBLIC_STOREFRONT_SELECT, version: true },
        });
      });
      const { version, ...storefront } = updated;
      return { ...(await this.withRatingAggregate(storefront)), version };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Storefront slug is already taken');
      throw error;
    }
  }

  /** Reads the already-persisted SellerRatingSummary row — never recomputes it. */
  private async withRatingAggregate<T extends { id: string }>(
    row: T,
  ): Promise<
    T & {
      averageRating: number | null;
      ratingCount: number;
      ratingHistogram: RatingHistogram;
    }
  > {
    const summary = await this.prisma.sellerRatingSummary.findUnique({
      where: { sellerId: row.id },
    });
    return {
      ...row,
      averageRating: averageRatingFromSummary(summary),
      ratingCount: summary?.ratingCount ?? 0,
      ratingHistogram: ratingHistogramFromSummary(summary),
    };
  }
}
