import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import {
  ReviewModerationState,
  ReviewVisibility,
  type ProductReview,
} from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { AdminReviewsService } from '../src/modules/reviews/admin/admin-reviews.service';
import { RatingAggregateService } from '../src/modules/reviews/rating-aggregate.service';

/**
 * Direct-instantiation integration suite (real Postgres) for the admin
 * moderation half of #38 — concurrent transitions, aggregate correctness
 * across hide/restore/remove, and idempotent-replay dedup. Fixtures are
 * built by writing ProductReview/SellerRating rows directly rather than via
 * the customer-facing ReviewsService, since moderation doesn't care how a
 * review/rating came to exist — only that one already does.
 */
describe('Admin review moderation (integration, real Postgres)', () => {
  const prisma = new PrismaService();
  const auditService = new AuditService(prisma);
  const ratingAggregateService = new RatingAggregateService(prisma);
  const service = new AdminReviewsService(
    prisma,
    auditService,
    ratingAggregateService,
  );

  const suffix = randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdSellerIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdOrderIds.length) {
      const orderItems = await prisma.orderItem.findMany({
        where: { orderId: { in: createdOrderIds } },
        select: { id: true },
      });
      const orderItemIds = orderItems.map((i) => i.id);
      const sellerOrders = await prisma.sellerOrder.findMany({
        where: { orderId: { in: createdOrderIds } },
        select: { id: true },
      });
      const sellerOrderIds = sellerOrders.map((so) => so.id);
      const reviews = await prisma.productReview.findMany({
        where: { orderItemId: { in: orderItemIds } },
        select: { id: true },
      });
      const ratings = await prisma.sellerRating.findMany({
        where: { sellerOrderId: { in: sellerOrderIds } },
        select: { id: true },
      });
      const targetIds = [...reviews.map((r) => r.id), ...ratings.map((r) => r.id)];
      await prisma.reviewReport.deleteMany({
        where: {
          OR: [
            { productReviewId: { in: reviews.map((r) => r.id) } },
            { sellerRatingId: { in: ratings.map((r) => r.id) } },
          ],
        },
      });
      await prisma.reviewModerationEvent.deleteMany({
        where: { targetId: { in: targetIds } },
      });
      await prisma.auditEvent.deleteMany({
        where: { targetId: { in: targetIds } },
      });
      await prisma.productReview.deleteMany({
        where: { orderItemId: { in: orderItemIds } },
      });
      await prisma.sellerRating.deleteMany({
        where: { sellerOrderId: { in: sellerOrderIds } },
      });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdProductIds.length) {
      await prisma.productRatingSummary.deleteMany({
        where: { productId: { in: createdProductIds } },
      });
      await prisma.offer.deleteMany({
        where: { variant: { productId: { in: createdProductIds } } },
      });
      await prisma.productVariant.deleteMany({
        where: { productId: { in: createdProductIds } },
      });
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    }
    if (createdSellerIds.length) {
      await prisma.sellerRatingSummary.deleteMany({
        where: { sellerId: { in: createdSellerIds } },
      });
      await prisma.seller.deleteMany({ where: { id: { in: createdSellerIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  async function createUser(label: string): Promise<string> {
    const rowSuffix = `${suffix}-${randomUUID().slice(0, 8)}`;
    const user = await prisma.user.create({
      data: { email: `admin-reviews-${label}-${rowSuffix}@example.test`, passwordHash: 'x' },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  /** A minimal delivered-enough ProductReview: bypasses ReviewsService's
   * eligibility checks entirely, since moderation only needs a row to exist. */
  async function createProductReviewFixture(
    authorUserId: string,
  ): Promise<{ review: ProductReview; productId: string }> {
    const rowSuffix = `${suffix}-${randomUUID().slice(0, 8)}`;
    const product = await prisma.product.create({
      data: { name: `Admin Reviews Product ${rowSuffix}`, slug: `admin-reviews-product-${rowSuffix}` },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, skuCode: `ADMREV-SKU-${rowSuffix}` },
    });
    const offer = await prisma.offer.create({ data: { variantId: variant.id } });
    const order = await prisma.order.create({
      data: {
        userId: authorUserId,
        currency: 'ZMW',
        subtotal: 1_000,
        total: 1_000,
        shippingAddress: {},
      },
    });
    createdOrderIds.push(order.id);
    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        offerId: offer.id,
        quantity: 1,
        unitAmount: 1_000,
        lineTotal: 1_000,
        currency: 'ZMW',
      },
    });

    const now = new Date();
    const review = await prisma.productReview.create({
      data: {
        orderItemId: orderItem.id,
        authorUserId,
        productId: product.id,
        variantId: variant.id,
        offerId: offer.id,
        rating: 4,
        body: 'A perfectly ordinary review body for integration testing.',
        deliveredAt: now,
        verifiedAt: now,
        editDeadline: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return { review, productId: product.id };
  }

  describe('concurrent moderation', () => {
    it('lets exactly one of two concurrent hide attempts on the same version win', async () => {
      const authorId = await createUser('author1');
      const adminId = await createUser('admin1');
      const { review } = await createProductReviewFixture(authorId);

      const results = await Promise.allSettled([
        service.hide(
          'product',
          review.id,
          { version: 0, reason: 'first attempt' },
          adminId,
          randomUUID(),
        ),
        service.hide(
          'product',
          review.id,
          { version: 0, reason: 'second attempt' },
          adminId,
          randomUUID(),
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictException,
      );

      const final = await prisma.productReview.findUniqueOrThrow({
        where: { id: review.id },
      });
      expect(final.visibility).toBe(ReviewVisibility.HIDDEN);
      expect(final.version).toBe(1);

      const events = await prisma.reviewModerationEvent.findMany({
        where: { targetId: review.id },
      });
      expect(events).toHaveLength(1);
    });
  });

  describe('aggregate correctness across hide -> restore -> remove', () => {
    it('keeps the product rating summary exact through each visibility change', async () => {
      const authorId = await createUser('author2');
      const adminId = await createUser('admin2');
      const { review, productId } = await createProductReviewFixture(authorId);

      // Establish a baseline summary the way submission would (moderation
      // never creates the initial row — it only ever recalculates one that
      // already reflects at least one PUBLISHED review).
      await prisma.$transaction((tx) =>
        ratingAggregateService.recalculateProductSummary(tx, productId),
      );
      let summary = await prisma.productRatingSummary.findUniqueOrThrow({
        where: { productId },
      });
      expect(summary.ratingCount).toBe(1);
      expect(summary.ratingSum).toBe(4);

      await service.hide(
        'product',
        review.id,
        { version: 0, reason: 'hidden for review' },
        adminId,
        randomUUID(),
      );
      summary = await prisma.productRatingSummary.findUniqueOrThrow({
        where: { productId },
      });
      expect(summary.ratingCount).toBe(0);
      expect(summary.ratingSum).toBe(0);

      await service.restore(
        'product',
        review.id,
        { version: 1, reason: 'cleared on appeal' },
        adminId,
        randomUUID(),
      );
      summary = await prisma.productRatingSummary.findUniqueOrThrow({
        where: { productId },
      });
      expect(summary.ratingCount).toBe(1);
      expect(summary.ratingSum).toBe(4);

      const restored = await prisma.productReview.findUniqueOrThrow({
        where: { id: review.id },
      });
      expect(restored.moderationState).toBe(ReviewModerationState.PENDING);

      await service.remove(
        'product',
        review.id,
        { version: 2, reason: 'policy violation' },
        adminId,
        randomUUID(),
      );
      summary = await prisma.productRatingSummary.findUniqueOrThrow({
        where: { productId },
      });
      expect(summary.ratingCount).toBe(0);
      expect(summary.ratingSum).toBe(0);

      // REMOVED is terminal — a further restore attempt must be rejected.
      await expect(
        service.restore(
          'product',
          review.id,
          { version: 3, reason: 'should not work' },
          adminId,
          randomUUID(),
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('idempotent replay', () => {
    it('does not duplicate ReviewModerationEvent or AuditEvent rows on a retried request', async () => {
      const authorId = await createUser('author3');
      const adminId = await createUser('admin3');
      const { review } = await createProductReviewFixture(authorId);
      const idempotencyKey = randomUUID();

      const first = await service.hide(
        'product',
        review.id,
        { version: 0, reason: 'duplicate-content' },
        adminId,
        idempotencyKey,
      );
      const second = await service.hide(
        'product',
        review.id,
        { version: 0, reason: 'duplicate-content' },
        adminId,
        idempotencyKey,
      );

      expect(first.visibility).toBe(ReviewVisibility.HIDDEN);
      expect(second.visibility).toBe(ReviewVisibility.HIDDEN);

      const events = await prisma.reviewModerationEvent.findMany({
        where: { targetId: review.id },
      });
      expect(events).toHaveLength(1);

      const auditEvents = await prisma.auditEvent.findMany({
        where: { targetId: review.id },
      });
      expect(auditEvents).toHaveLength(1);

      const final = await prisma.productReview.findUniqueOrThrow({
        where: { id: review.id },
      });
      // The replay did not apply the transition a second time.
      expect(final.version).toBe(1);
    });

    it('rejects a reused key against a different payload with ConflictException', async () => {
      const authorId = await createUser('author4');
      const adminId = await createUser('admin4');
      const { review } = await createProductReviewFixture(authorId);
      const idempotencyKey = randomUUID();

      await service.hide(
        'product',
        review.id,
        { version: 0, reason: 'first reason' },
        adminId,
        idempotencyKey,
      );

      await expect(
        service.remove(
          'product',
          review.id,
          { version: 1, reason: 'different action entirely' },
          adminId,
          idempotencyKey,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
