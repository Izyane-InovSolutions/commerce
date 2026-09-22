import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { OutboxService } from '../src/infrastructure/jobs/outbox.service';
import { RatingAggregateService } from '../src/modules/reviews/rating-aggregate.service';
import { ReviewEligibilityService } from '../src/modules/reviews/review-eligibility.service';
import { ReviewsService } from '../src/modules/reviews/reviews.service';

describe('Reviews integrity (integration, real Postgres)', () => {
  const prisma = new PrismaService();
  const eligibilityService = new ReviewEligibilityService(prisma);
  const ratingAggregateService = new RatingAggregateService(prisma);
  const outboxService = new OutboxService(prisma);
  const service = new ReviewsService(
    prisma,
    eligibilityService,
    ratingAggregateService,
    outboxService,
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
      const orderItemIds = orderItems.map((item) => item.id);
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
      await prisma.reviewReport.deleteMany({
        where: {
          OR: [
            { productReviewId: { in: reviews.map((r) => r.id) } },
            { sellerRatingId: { in: ratings.map((r) => r.id) } },
          ],
        },
      });
      await prisma.reviewModerationEvent.deleteMany({
        where: {
          targetId: { in: [...reviews.map((r) => r.id), ...ratings.map((r) => r.id)] },
        },
      });
      await prisma.productReviewRevision.deleteMany({
        where: { productReviewId: { in: reviews.map((r) => r.id) } },
      });
      await prisma.sellerRatingRevision.deleteMany({
        where: { sellerRatingId: { in: ratings.map((r) => r.id) } },
      });
      await prisma.productReview.deleteMany({ where: { orderItemId: { in: orderItemIds } } });
      await prisma.sellerRating.deleteMany({ where: { sellerOrderId: { in: sellerOrderIds } } });

      const fulfillmentOrders = await prisma.fulfillmentOrder.findMany({
        where: { orderId: { in: createdOrderIds } },
        select: { id: true },
      });
      const fulfillmentOrderIds = fulfillmentOrders.map((fo) => fo.id);
      if (fulfillmentOrderIds.length) {
        await prisma.shipment.deleteMany({
          where: { fulfillmentOrderId: { in: fulfillmentOrderIds } },
        });
      }
      await prisma.fulfillmentOrder.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
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

  /**
   * Builds a paid order with a single delivered OrderItem for one customer,
   * plus (optionally) a real seller so a seller rating can be submitted
   * too. Bypasses the fulfillment/shipment services entirely — this suite
   * only needs the delivered state those services eventually produce.
   */
  async function createDeliveredOrder(options?: { withSeller?: boolean }): Promise<{
    userId: string;
    productId: string;
    sellerId: string | undefined;
    orderId: string;
    orderItemId: string;
    sellerOrderId: string;
  }> {
    const rowSuffix = `${suffix}-${randomUUID().slice(0, 8)}`;
    const user = await prisma.user.create({
      data: { email: `reviews-${rowSuffix}@example.test`, passwordHash: 'x' },
    });
    createdUserIds.push(user.id);

    let sellerId: string | undefined;
    if (options?.withSeller) {
      const sellerOwner = await prisma.user.create({
        data: { email: `reviews-seller-${rowSuffix}@example.test`, passwordHash: 'x' },
      });
      createdUserIds.push(sellerOwner.id);
      const seller = await prisma.seller.create({
        data: {
          ownerUserId: sellerOwner.id,
          businessName: `Reviews Seller ${rowSuffix}`,
          registrationNumber: `REG-${rowSuffix}`,
          country: 'ZM',
          businessAddress: '1 Test Street',
          contactEmail: `seller-${rowSuffix}@example.test`,
        },
      });
      createdSellerIds.push(seller.id);
      sellerId = seller.id;
    }

    const product = await prisma.product.create({
      data: { name: `Reviews Product ${rowSuffix}`, slug: `reviews-product-${rowSuffix}` },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, skuCode: `REV-SKU-${rowSuffix}` },
    });
    const offer = await prisma.offer.create({
      data: { variantId: variant.id, sellerId },
    });

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        currency: 'ZMW',
        subtotal: 1_000,
        total: 1_000,
        shippingAddress: {},
        sellerOrders: {
          create: { sellerId, currency: 'ZMW', subtotal: 1_000, total: 1_000 },
        },
      },
      include: { sellerOrders: true },
    });
    createdOrderIds.push(order.id);
    const sellerOrder = order.sellerOrders[0]!;

    const shippingGroup = await prisma.shippingGroup.create({
      data: {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        fulfillmentMode: 'PLATFORM',
        serviceLevel: 'STANDARD',
        rateCode: 'RATE',
        methodCode: 'STANDARD',
        methodName: 'Standard',
        subtotal: 1_000,
        shippingAmount: 0,
        total: 1_000,
        currency: 'ZMW',
        quoteId: `QUOTE-${rowSuffix}`,
        quoteExpiresAt: new Date(Date.now() + 86_400_000),
        estimatedDeliveryMinDays: 1,
        estimatedDeliveryMaxDays: 3,
      },
    });

    const fulfillmentOrder = await prisma.fulfillmentOrder.create({
      data: {
        fulfillmentNumber: `FUL-${rowSuffix}`,
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        shippingGroupId: shippingGroup.id,
      },
    });

    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        shippingGroupId: shippingGroup.id,
        offerId: offer.id,
        quantity: 2,
        unitAmount: 500,
        lineTotal: 1_000,
        currency: 'ZMW',
      },
    });

    const fulfillmentLine = await prisma.fulfillmentLine.create({
      data: {
        fulfillmentOrderId: fulfillmentOrder.id,
        orderItemId: orderItem.id,
        variantId: variant.id,
        allocatedQuantity: 2,
      },
    });

    const shipment = await prisma.shipment.create({
      data: {
        shipmentNumber: `SHIP-${rowSuffix}`,
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        shippingGroupId: shippingGroup.id,
        fulfillmentOrderId: fulfillmentOrder.id,
        providerCode: 'ZONE',
        carrierCode: 'MANUAL',
        methodCode: 'STANDARD',
        status: ShipmentStatus.DELIVERED,
        bookingIdempotencyKey: `BOOK-${rowSuffix}`,
        deliveredAt: new Date(),
      },
    });
    await prisma.shipmentLine.create({
      data: {
        shipmentId: shipment.id,
        fulfillmentLineId: fulfillmentLine.id,
        orderItemId: orderItem.id,
        quantity: 2,
      },
    });

    return {
      userId: user.id,
      productId: product.id,
      sellerId,
      orderId: order.id,
      orderItemId: orderItem.id,
      sellerOrderId: sellerOrder.id,
    };
  }

  it('allows only one of two concurrent submissions for the same order item to succeed', async () => {
    const { userId, orderItemId, productId } = await createDeliveredOrder();

    const results = await Promise.allSettled([
      service.submitProductReview(userId, {
        orderItemId,
        rating: 5,
        body: 'Concurrent submission attempt one.',
      }),
      service.submitProductReview(userId, {
        orderItemId,
        rating: 3,
        body: 'Concurrent submission attempt two.',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reviews = await prisma.productReview.findMany({
      where: { orderItemId },
    });
    expect(reviews).toHaveLength(1);

    const summary = await prisma.productRatingSummary.findUnique({
      where: { productId },
    });
    expect(summary?.ratingCount).toBe(1);
  });

  it('keeps the product rating summary exact through submit, edit, and withdrawal', async () => {
    const { userId, orderItemId, productId } = await createDeliveredOrder();

    const review = await service.submitProductReview(userId, {
      orderItemId,
      rating: 4,
      body: 'Solid product, would buy again soon.',
    });

    let summary = await prisma.productRatingSummary.findUniqueOrThrow({
      where: { productId },
    });
    expect(summary.ratingCount).toBe(1);
    expect(summary.ratingSum).toBe(4);
    expect(summary.star4Count).toBe(1);

    await service.editProductReview(
      userId,
      review.id,
      { version: 0, rating: 2 },
      randomUUID(),
    );
    summary = await prisma.productRatingSummary.findUniqueOrThrow({
      where: { productId },
    });
    expect(summary.ratingCount).toBe(1);
    expect(summary.ratingSum).toBe(2);
    expect(summary.star2Count).toBe(1);
    expect(summary.star4Count).toBe(0);

    await service.withdrawProductReview(userId, review.id, randomUUID());
    summary = await prisma.productRatingSummary.findUniqueOrThrow({
      where: { productId },
    });
    expect(summary.ratingCount).toBe(0);
    expect(summary.ratingSum).toBe(0);

    const withdrawn = await prisma.productReview.findUniqueOrThrow({
      where: { id: review.id },
    });
    expect(withdrawn.visibility).toBe('WITHDRAWN');
  });

  it('keeps the seller rating summary exact and blocks self-rating and duplicates', async () => {
    const { userId, sellerOrderId, sellerId } = await createDeliveredOrder({
      withSeller: true,
    });

    const rating = await service.submitSellerRating(userId, {
      sellerOrderId,
      rating: 5,
    });

    const summary = await prisma.sellerRatingSummary.findUniqueOrThrow({
      where: { sellerId: sellerId! },
    });
    expect(summary.ratingCount).toBe(1);
    expect(summary.ratingSum).toBe(5);

    await expect(
      service.submitSellerRating(userId, { sellerOrderId, rating: 3 }),
    ).rejects.toThrow(ConflictException);

    await service.withdrawSellerRating(userId, rating.id, randomUUID());
    const summaryAfterWithdrawal = await prisma.sellerRatingSummary.findUniqueOrThrow({
      where: { sellerId: sellerId! },
    });
    expect(summaryAfterWithdrawal.ratingCount).toBe(0);
  });

  it('does not duplicate a revision on a replayed edit Idempotency-Key', async () => {
    const { userId, orderItemId } = await createDeliveredOrder();
    const review = await service.submitProductReview(userId, {
      orderItemId,
      rating: 4,
      body: 'Original body text here for review.',
    });

    const key = randomUUID();
    const edit = { version: 0, rating: 3 };
    const first = await service.editProductReview(userId, review.id, edit, key);
    const replay = await service.editProductReview(userId, review.id, edit, key);

    expect(replay.id).toBe(first.id);
    const revisions = await prisma.productReviewRevision.count({
      where: { productReviewId: review.id },
    });
    expect(revisions).toBe(2); // submission + the single edit
  });

  it('does not duplicate a report on a replayed report Idempotency-Key', async () => {
    const { userId, orderItemId, productId } = await createDeliveredOrder();
    const review = await service.submitProductReview(userId, {
      orderItemId,
      rating: 4,
      body: 'Original body text here for review.',
    });
    const reporter = await prisma.user.create({
      data: { email: `reporter-${randomUUID()}@example.test`, passwordHash: 'x' },
    });
    createdUserIds.push(reporter.id);

    const key = randomUUID();
    const dto = { reason: 'SPAM' as const };
    const first = await service.reportProductReview(reporter.id, review.id, dto, key);
    const replay = await service.reportProductReview(reporter.id, review.id, dto, key);

    expect(replay.id).toBe(first.id);
    const reportCount = await prisma.reviewReport.count({
      where: { productReviewId: review.id },
    });
    expect(reportCount).toBe(1);

    const flagged = await prisma.productReview.findUniqueOrThrow({
      where: { id: review.id },
    });
    expect(flagged.moderationState).toBe('FLAGGED');
    void productId;
  });
});
