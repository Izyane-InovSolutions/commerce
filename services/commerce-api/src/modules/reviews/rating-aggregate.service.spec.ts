import { RatingAggregateService } from './rating-aggregate.service';
import { PrismaService } from '../../database/prisma.service';

type Tx = {
  $queryRaw: jest.Mock;
  productRatingSummary: { upsert: jest.Mock; update: jest.Mock };
  sellerRatingSummary: { upsert: jest.Mock; update: jest.Mock };
  productReview: { findMany: jest.Mock };
  sellerRating: { findMany: jest.Mock };
};

function buildTx(): Tx {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    productRatingSummary: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn((args: { where: { productId: string }; data: object }) =>
        Promise.resolve({ productId: args.where.productId, ...args.data }),
      ),
    },
    sellerRatingSummary: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn((args: { where: { sellerId: string }; data: object }) =>
        Promise.resolve({ sellerId: args.where.sellerId, ...args.data }),
      ),
    },
    productReview: { findMany: jest.fn().mockResolvedValue([]) },
    sellerRating: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function buildPrisma(): {
  productReview: { findMany: jest.Mock };
  sellerRating: { findMany: jest.Mock };
  productRatingSummary: { findMany: jest.Mock };
  sellerRatingSummary: { findMany: jest.Mock };
  $transaction: jest.Mock;
  tx: Tx;
} {
  const tx = buildTx();
  return {
    productReview: { findMany: jest.fn().mockResolvedValue([]) },
    sellerRating: { findMany: jest.fn().mockResolvedValue([]) },
    productRatingSummary: { findMany: jest.fn().mockResolvedValue([]) },
    sellerRatingSummary: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((arg: (client: Tx) => unknown) => arg(tx)),
    tx,
  };
}

describe('RatingAggregateService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: RatingAggregateService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new RatingAggregateService(prisma as unknown as PrismaService);
  });

  describe('recalculateProductSummary', () => {
    it('locks, recomputes count/sum/histogram exactly from PUBLISHED reviews only', async () => {
      prisma.tx.productReview.findMany.mockResolvedValue([
        { rating: 5 },
        { rating: 5 },
        { rating: 3 },
        { rating: 1 },
      ]);

      const result = await service.recalculateProductSummary(
        prisma.tx as never,
        'product-1',
      );

      expect(prisma.tx.productReview.findMany).toHaveBeenCalledWith({
        where: { productId: 'product-1', visibility: 'PUBLISHED' },
        select: { rating: true },
      });
      expect(result).toMatchObject({
        ratingCount: 4,
        ratingSum: 5 + 5 + 3 + 1,
        star1Count: 1,
        star2Count: 0,
        star3Count: 1,
        star4Count: 0,
        star5Count: 2,
      });
      // Star-histogram/count/sum consistency the DB CHECK constraint enforces.
      expect(
        result.star1Count +
          result.star2Count +
          result.star3Count +
          result.star4Count +
          result.star5Count,
      ).toBe(result.ratingCount);
      expect(
        1 * result.star1Count +
          2 * result.star2Count +
          3 * result.star3Count +
          4 * result.star4Count +
          5 * result.star5Count,
      ).toBe(result.ratingSum);
    });

    it('produces a zeroed summary when there are no PUBLISHED reviews', async () => {
      const result = await service.recalculateProductSummary(
        prisma.tx as never,
        'product-empty',
      );
      expect(result).toMatchObject({
        ratingCount: 0,
        ratingSum: 0,
        star1Count: 0,
        star2Count: 0,
        star3Count: 0,
        star4Count: 0,
        star5Count: 0,
      });
    });

    it('upserts and locks the summary row before recomputing', async () => {
      await service.recalculateProductSummary(prisma.tx as never, 'product-1');
      expect(prisma.tx.productRatingSummary.upsert).toHaveBeenCalledWith({
        where: { productId: 'product-1' },
        create: expect.objectContaining({ productId: 'product-1' }) as object,
        update: {},
      });
      expect(prisma.tx.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('recalculateSellerSummary', () => {
    it('recomputes exactly from PUBLISHED seller ratings only', async () => {
      prisma.tx.sellerRating.findMany.mockResolvedValue([
        { rating: 2 },
        { rating: 4 },
      ]);
      const result = await service.recalculateSellerSummary(
        prisma.tx as never,
        'seller-1',
      );
      expect(prisma.tx.sellerRating.findMany).toHaveBeenCalledWith({
        where: { sellerId: 'seller-1', visibility: 'PUBLISHED' },
        select: { rating: true },
      });
      expect(result).toMatchObject({
        ratingCount: 2,
        ratingSum: 6,
        star2Count: 1,
        star4Count: 1,
      });
    });
  });

  describe('rebuildAllSummaries', () => {
    it('recalculates every distinct product and seller with at least one review/rating', async () => {
      prisma.productReview.findMany.mockResolvedValue([
        { productId: 'p1' },
        { productId: 'p2' },
      ]);
      prisma.sellerRating.findMany.mockResolvedValue([{ sellerId: 's1' }]);
      prisma.productRatingSummary.findMany.mockResolvedValue([
        { productId: 'p2' },
        { productId: 'orphan-product' },
      ]);
      prisma.sellerRatingSummary.findMany.mockResolvedValue([
        { sellerId: 'orphan-seller' },
      ]);

      const result = await service.rebuildAllSummaries();

      expect(result).toEqual({ productsRebuilt: 3, sellersRebuilt: 2 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(5);
    });
  });

  describe('checkSummaryIntegrity', () => {
    it('reports no mismatches when the stored summary matches a fresh recalculation', async () => {
      prisma.productRatingSummary.findMany.mockResolvedValue([
        {
          productId: 'p1',
          ratingCount: 1,
          ratingSum: 5,
          star1Count: 0,
          star2Count: 0,
          star3Count: 0,
          star4Count: 0,
          star5Count: 1,
        },
      ]);
      prisma.productReview.findMany
        .mockResolvedValueOnce([{ productId: 'p1' }])
        .mockResolvedValue([{ rating: 5 }]);

      const result = await service.checkSummaryIntegrity();
      expect(result.productMismatches).toEqual([]);
    });

    it('reports a mismatch when the stored summary has drifted from a fresh recalculation', async () => {
      prisma.productRatingSummary.findMany.mockResolvedValue([
        {
          productId: 'p1',
          ratingCount: 1,
          ratingSum: 5,
          star1Count: 0,
          star2Count: 0,
          star3Count: 0,
          star4Count: 0,
          star5Count: 1,
        },
      ]);
      // Authoritative PUBLISHED reviews now disagree with the stored summary.
      prisma.productReview.findMany
        .mockResolvedValueOnce([{ productId: 'p1' }])
        .mockResolvedValue([{ rating: 5 }, { rating: 3 }]);

      const result = await service.checkSummaryIntegrity();
      expect(result.productMismatches).toHaveLength(1);
      expect(result.productMismatches[0]!.id).toBe('p1');
      expect(result.productMismatches[0]!.recalculated.ratingCount).toBe(2);
    });

    it('reports an entity with published feedback but no summary row', async () => {
      prisma.productReview.findMany.mockResolvedValueOnce([
        { productId: 'missing-summary' },
      ]);
      prisma.tx.productReview.findMany.mockResolvedValue([{ rating: 4 }]);

      const result = await service.checkSummaryIntegrity();
      expect(result.productMismatches).toEqual([
        expect.objectContaining({ id: 'missing-summary', stored: null }),
      ]);
    });
  });
});
