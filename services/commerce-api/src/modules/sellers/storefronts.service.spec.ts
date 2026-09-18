import { NotFoundException } from '@nestjs/common';
import { ReviewVisibility } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { SellersService } from './sellers.service';
import { StorefrontsService } from './storefronts.service';

function buildPrisma(): {
  seller: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  sellerRatingSummary: { findUnique: jest.Mock };
  sellerRating: { findMany: jest.Mock; count: jest.Mock };
  auditEvent: { create: jest.Mock };
  $transaction: jest.Mock;
} {
  return {
    seller: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    sellerRatingSummary: { findUnique: jest.fn() },
    sellerRating: { findMany: jest.fn(), count: jest.fn() },
    auditEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
}

describe('StorefrontsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: StorefrontsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new StorefrontsService(
      prisma as unknown as PrismaService,
      {} as unknown as SellersService,
    );
  });

  describe('findPublic', () => {
    it('throws not found when no approved storefront matches the slug', async () => {
      prisma.seller.findFirst.mockResolvedValue(null);

      await expect(service.findPublic('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('defaults to null average and a zero histogram with no summary row', async () => {
      prisma.seller.findFirst.mockResolvedValue({
        id: 'seller-1',
        storefrontSlug: 'acme',
        displayName: 'Acme',
        description: null,
      });
      prisma.sellerRatingSummary.findUnique.mockResolvedValue(null);

      const result = await service.findPublic('acme');

      expect(result.averageRating).toBeNull();
      expect(result.ratingCount).toBe(0);
      expect(result.ratingHistogram).toEqual({
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      });
    });

    it('computes averageRating from the summary row', async () => {
      prisma.seller.findFirst.mockResolvedValue({
        id: 'seller-1',
        storefrontSlug: 'acme',
        displayName: 'Acme',
        description: null,
      });
      prisma.sellerRatingSummary.findUnique.mockResolvedValue({
        sellerId: 'seller-1',
        ratingCount: 2,
        ratingSum: 9,
        star1Count: 0,
        star2Count: 0,
        star3Count: 0,
        star4Count: 1,
        star5Count: 1,
        version: 0,
        recalculatedAt: new Date(),
      });

      const result = await service.findPublic('acme');

      expect(result.averageRating).toBe(4.5);
      expect(result.ratingCount).toBe(2);
      expect(result.ratingHistogram).toEqual({
        1: 0,
        2: 0,
        3: 0,
        4: 1,
        5: 1,
      });
    });
  });

  describe('findPublicRatings', () => {
    it('throws not found when the seller is not an approved storefront', async () => {
      prisma.seller.findFirst.mockResolvedValue(null);

      await expect(
        service.findPublicRatings('missing', { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('scopes to PUBLISHED ratings for the resolved seller and projects the public shape', async () => {
      prisma.seller.findFirst.mockResolvedValue({ id: 'seller-1' });
      prisma.sellerRating.findMany.mockResolvedValue([
        {
          id: 'rating-1',
          rating: 4,
          comment: 'Good seller',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          author: { firstName: 'Jane', lastName: null },
        },
      ]);
      prisma.sellerRating.count.mockResolvedValue(1);

      const result = await service.findPublicRatings('acme', {
        page: 1,
        limit: 20,
      });

      expect(prisma.sellerRating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sellerId: 'seller-1',
            visibility: ReviewVisibility.PUBLISHED,
          }) as object,
        }),
      );
      expect(result.data).toEqual([
        {
          id: 'rating-1',
          rating: 4,
          comment: 'Good seller',
          reviewerLabel: 'Verified customer',
          verifiedPurchase: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ]);
    });
  });
});
