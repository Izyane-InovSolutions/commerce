import { ReviewModerationState, ReviewReportStatus, ReviewVisibility } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { SellerReviewsService } from './seller-reviews.service';

function buildPrisma(): {
  productReview: { findMany: jest.Mock; count: jest.Mock };
  sellerRating: { findMany: jest.Mock; count: jest.Mock };
} {
  return {
    productReview: { findMany: jest.fn(), count: jest.fn() },
    sellerRating: { findMany: jest.fn(), count: jest.fn() },
  };
}

describe('SellerReviewsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: SellerReviewsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new SellerReviewsService(prisma as unknown as PrismaService);
  });

  describe('listReviews', () => {
    it('scopes to the seller and includes moderation status and an aggregate report flag', async () => {
      prisma.productReview.findMany.mockResolvedValue([
        {
          id: 'r1',
          rating: 2,
          title: 'Meh',
          body: 'Could be better',
          visibility: ReviewVisibility.HIDDEN,
          moderationState: ReviewModerationState.FLAGGED,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          deliveredAt: new Date('2025-12-20T00:00:00Z'),
          author: { firstName: 'Jane', lastName: 'Doe' },
          product: { id: 'p1', name: 'Widget', slug: 'widget' },
          _count: { ReviewReport: 2 },
        },
      ]);
      prisma.productReview.count.mockResolvedValue(1);

      const result = await service.listReviews('seller-1', {
        page: 1,
        limit: 20,
      });

      expect(prisma.productReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sellerId: 'seller-1' }) as object,
        }),
      );
      expect(result.data).toEqual([
        {
          id: 'r1',
          rating: 2,
          title: 'Meh',
          body: 'Could be better',
          reviewerLabel: 'Jane D.',
          visibility: ReviewVisibility.HIDDEN,
          moderationState: ReviewModerationState.FLAGGED,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          deliveredAt: new Date('2025-12-20T00:00:00Z'),
          hasOpenReport: true,
          product: { id: 'p1', name: 'Widget', slug: 'widget' },
        },
      ]);
      // Never leaks the reporter/report content — only an aggregate boolean.
      const leaked = result.data[0] as unknown as Record<string, unknown>;
      expect(leaked.authorUserId).toBeUndefined();
      expect(leaked.resolutionNote).toBeUndefined();
      expect(leaked._count).toBeUndefined();
    });

    it('applies rating/visibility/moderationState/date-range filters', async () => {
      prisma.productReview.findMany.mockResolvedValue([]);
      prisma.productReview.count.mockResolvedValue(0);

      await service.listReviews('seller-1', {
        page: 1,
        limit: 20,
        rating: 5,
        visibility: ReviewVisibility.PUBLISHED,
        moderationState: ReviewModerationState.APPROVED,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });

      expect(prisma.productReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sellerId: 'seller-1',
            rating: 5,
            visibility: ReviewVisibility.PUBLISHED,
            moderationState: ReviewModerationState.APPROVED,
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-01-31'),
            },
          }) as object,
        }),
      );
    });

    it('filters to rows with an open report when reported=true', async () => {
      prisma.productReview.findMany.mockResolvedValue([]);
      prisma.productReview.count.mockResolvedValue(0);

      await service.listReviews('seller-1', {
        page: 1,
        limit: 20,
        reported: true,
      });

      expect(prisma.productReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ReviewReport: { some: { status: ReviewReportStatus.OPEN } },
          }) as object,
        }),
      );
    });
  });

  describe('listRatings', () => {
    it('scopes to the seller and projects moderation status without report detail', async () => {
      prisma.sellerRating.findMany.mockResolvedValue([
        {
          id: 'rating-1',
          rating: 3,
          comment: 'Fine',
          visibility: ReviewVisibility.PUBLISHED,
          moderationState: ReviewModerationState.PENDING,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          deliveredAt: new Date('2025-12-20T00:00:00Z'),
          author: { firstName: null, lastName: null },
          _count: { ReviewReport: 0 },
        },
      ]);
      prisma.sellerRating.count.mockResolvedValue(1);

      const result = await service.listRatings('seller-1', {
        page: 1,
        limit: 20,
      });

      expect(prisma.sellerRating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sellerId: 'seller-1' }) as object,
        }),
      );
      expect(result.data).toEqual([
        {
          id: 'rating-1',
          rating: 3,
          comment: 'Fine',
          reviewerLabel: 'Verified customer',
          visibility: ReviewVisibility.PUBLISHED,
          moderationState: ReviewModerationState.PENDING,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          deliveredAt: new Date('2025-12-20T00:00:00Z'),
          hasOpenReport: false,
        },
      ]);
    });
  });
});
