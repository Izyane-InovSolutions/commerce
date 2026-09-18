import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReviewVisibility,
  type ProductRatingSummary,
  type SellerRatingSummary,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

type HistogramValues = {
  ratingCount: number;
  ratingSum: number;
  star1Count: number;
  star2Count: number;
  star3Count: number;
  star4Count: number;
  star5Count: number;
};

export type SummaryMismatch = {
  id: string;
  stored: HistogramValues | null;
  recalculated: HistogramValues;
};

// FOR-UPDATE-lockable Prisma client shape shared by product and seller
// summary recalculation — mirrors LedgerService.ensureCurrency's
// lock-then-read convention.
type SummaryClient = Prisma.TransactionClient | PrismaService;

/**
 * Frozen contract consumed by the admin-moderation module (every
 * visibility-changing moderation action) and this module's own submit/edit/
 * withdraw mutations. Do not change these two method signatures without
 * coordinating with that module.
 *
 * Exact recalculation only — every call recomputes count/sum/histogram from
 * scratch off the currently PUBLISHED rows, never increments a counter, so
 * drift from a missed call can never compound (see ledger.service.ts's
 * appendEntry for the same philosophy applied to balances).
 */
@Injectable()
export class RatingAggregateService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculateProductSummary(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<ProductRatingSummary> {
    await tx.productRatingSummary.upsert({
      where: { productId },
      create: { productId, recalculatedAt: new Date() },
      update: {},
    });
    await tx.$queryRaw`SELECT product_id FROM product_rating_summaries WHERE product_id = ${productId}::uuid FOR UPDATE`;
    const values = await this.computeProductHistogram(tx, productId);
    return tx.productRatingSummary.update({
      where: { productId },
      data: {
        ...values,
        version: { increment: 1 },
        recalculatedAt: new Date(),
      },
    });
  }

  async recalculateSellerSummary(
    tx: Prisma.TransactionClient,
    sellerId: string,
  ): Promise<SellerRatingSummary> {
    await tx.sellerRatingSummary.upsert({
      where: { sellerId },
      create: { sellerId, recalculatedAt: new Date() },
      update: {},
    });
    await tx.$queryRaw`SELECT seller_id FROM seller_rating_summaries WHERE seller_id = ${sellerId}::uuid FOR UPDATE`;
    const values = await this.computeSellerHistogram(tx, sellerId);
    return tx.sellerRatingSummary.update({
      where: { sellerId },
      data: {
        ...values,
        version: { increment: 1 },
        recalculatedAt: new Date(),
      },
    });
  }

  /**
   * Idempotent repair command for post-deploy runs (see
   * scripts/rebuild-review-summaries.ts) — recalculates every product/seller
   * that has at least one review/rating or an existing summary row, one small
   * transaction at a time. Including existing rows is important: after the
   * final review is removed, a stale non-zero summary still has to be zeroed.
   */
  async rebuildAllSummaries(): Promise<{
    productsRebuilt: number;
    sellersRebuilt: number;
  }> {
    const [reviewProducts, summaryProducts, ratingSellers, summarySellers] =
      await Promise.all([
        this.prisma.productReview.findMany({
          distinct: ['productId'],
          select: { productId: true },
        }),
        this.prisma.productRatingSummary.findMany({
          select: { productId: true },
        }),
        this.prisma.sellerRating.findMany({
          distinct: ['sellerId'],
          select: { sellerId: true },
        }),
        this.prisma.sellerRatingSummary.findMany({
          select: { sellerId: true },
        }),
      ]);
    const productIds = [
      ...new Set([
        ...reviewProducts.map(({ productId }) => productId),
        ...summaryProducts.map(({ productId }) => productId),
      ]),
    ];
    const sellerIds = [
      ...new Set([
        ...ratingSellers.map(({ sellerId }) => sellerId),
        ...summarySellers.map(({ sellerId }) => sellerId),
      ]),
    ];

    for (const productId of productIds) {
      await this.prisma.$transaction((tx) =>
        this.recalculateProductSummary(tx, productId),
      );
    }
    for (const sellerId of sellerIds) {
      await this.prisma.$transaction((tx) =>
        this.recalculateSellerSummary(tx, sellerId),
      );
    }

    return {
      productsRebuilt: productIds.length,
      sellersRebuilt: sellerIds.length,
    };
  }

  /**
   * Read-only comparison of every stored summary against a fresh
   * recalculation — never writes. Used by scripts/rebuild-review-summaries.ts
   * --check.
   */
  async checkSummaryIntegrity(): Promise<{
    productMismatches: SummaryMismatch[];
    sellerMismatches: SummaryMismatch[];
  }> {
    const [productSummaries, sellerSummaries, reviewProducts, ratingSellers] =
      await Promise.all([
        this.prisma.productRatingSummary.findMany(),
        this.prisma.sellerRatingSummary.findMany(),
        this.prisma.productReview.findMany({
          distinct: ['productId'],
          select: { productId: true },
        }),
        this.prisma.sellerRating.findMany({
          distinct: ['sellerId'],
          select: { sellerId: true },
        }),
      ]);

    const productMismatches: SummaryMismatch[] = [];
    const productSummaryById = new Map(
      productSummaries.map((summary) => [summary.productId, summary]),
    );
    const productIds = new Set([
      ...productSummaryById.keys(),
      ...reviewProducts.map(({ productId }) => productId),
    ]);
    for (const productId of productIds) {
      const stored = productSummaryById.get(productId);
      const recalculated = await this.computeProductHistogram(
        this.prisma,
        productId,
      );
      if (!stored || !this.equalHistograms(stored, recalculated)) {
        productMismatches.push({
          id: productId,
          stored: stored ? this.extractHistogram(stored) : null,
          recalculated,
        });
      }
    }

    const sellerMismatches: SummaryMismatch[] = [];
    const sellerSummaryById = new Map(
      sellerSummaries.map((summary) => [summary.sellerId, summary]),
    );
    const sellerIds = new Set([
      ...sellerSummaryById.keys(),
      ...ratingSellers.map(({ sellerId }) => sellerId),
    ]);
    for (const sellerId of sellerIds) {
      const stored = sellerSummaryById.get(sellerId);
      const recalculated = await this.computeSellerHistogram(
        this.prisma,
        sellerId,
      );
      if (!stored || !this.equalHistograms(stored, recalculated)) {
        sellerMismatches.push({
          id: sellerId,
          stored: stored ? this.extractHistogram(stored) : null,
          recalculated,
        });
      }
    }

    return { productMismatches, sellerMismatches };
  }

  private async computeProductHistogram(
    client: SummaryClient,
    productId: string,
  ): Promise<HistogramValues> {
    const reviews = await client.productReview.findMany({
      where: { productId, visibility: ReviewVisibility.PUBLISHED },
      select: { rating: true },
    });
    return this.histogram(reviews.map((r) => r.rating));
  }

  private async computeSellerHistogram(
    client: SummaryClient,
    sellerId: string,
  ): Promise<HistogramValues> {
    const ratings = await client.sellerRating.findMany({
      where: { sellerId, visibility: ReviewVisibility.PUBLISHED },
      select: { rating: true },
    });
    return this.histogram(ratings.map((r) => r.rating));
  }

  private histogram(ratings: number[]): HistogramValues {
    const stars = [0, 0, 0, 0, 0, 0];
    let ratingSum = 0;
    for (const rating of ratings) {
      stars[rating] = (stars[rating] ?? 0) + 1;
      ratingSum += rating;
    }
    return {
      ratingCount: ratings.length,
      ratingSum,
      star1Count: stars[1]!,
      star2Count: stars[2]!,
      star3Count: stars[3]!,
      star4Count: stars[4]!,
      star5Count: stars[5]!,
    };
  }

  private extractHistogram(summary: HistogramValues): HistogramValues {
    return {
      ratingCount: summary.ratingCount,
      ratingSum: summary.ratingSum,
      star1Count: summary.star1Count,
      star2Count: summary.star2Count,
      star3Count: summary.star3Count,
      star4Count: summary.star4Count,
      star5Count: summary.star5Count,
    };
  }

  private equalHistograms(a: HistogramValues, b: HistogramValues): boolean {
    return (
      a.ratingCount === b.ratingCount &&
      a.ratingSum === b.ratingSum &&
      a.star1Count === b.star1Count &&
      a.star2Count === b.star2Count &&
      a.star3Count === b.star3Count &&
      a.star4Count === b.star4Count &&
      a.star5Count === b.star5Count
    );
  }
}
