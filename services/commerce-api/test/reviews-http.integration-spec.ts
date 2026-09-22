/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';

describe('Reviews HTTP API (#38, integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const userIds: string[] = [];
  let sellerId: string;
  let productId: string;
  let orderId: string;
  let orderItemId: string;
  let sellerOrderId: string;
  let productReviewId: string;
  let sellerRatingId: string;
  let reportId: string;
  let buyerToken: string;
  let sellerToken: string;
  let adminToken: string;
  let storefrontSlug: string;
  let productSlug: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
        exceptionFactory: (errors: ValidationError[]) =>
          new ValidationException(errors),
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    await seedDeliveredOrder();
  });

  afterAll(async () => {
    const reviews = await prisma.productReview.findMany({
      where: { orderItemId },
      select: { id: true },
    });
    const ratings = await prisma.sellerRating.findMany({
      where: { sellerOrderId },
      select: { id: true },
    });
    const targetIds = [
      ...reviews.map((row) => row.id),
      ...ratings.map((row) => row.id),
    ];
    await prisma.reviewReport.deleteMany({
      where: {
        OR: [
          { productReviewId: { in: reviews.map((row) => row.id) } },
          { sellerRatingId: { in: ratings.map((row) => row.id) } },
        ],
      },
    });
    await prisma.reviewModerationEvent.deleteMany({
      where: { targetId: { in: targetIds } },
    });
    await prisma.productReviewRevision.deleteMany({
      where: { productReviewId: { in: reviews.map((row) => row.id) } },
    });
    await prisma.sellerRatingRevision.deleteMany({
      where: { sellerRatingId: { in: ratings.map((row) => row.id) } },
    });
    await prisma.productReview.deleteMany({
      where: { id: { in: reviews.map((row) => row.id) } },
    });
    await prisma.sellerRating.deleteMany({
      where: { id: { in: ratings.map((row) => row.id) } },
    });
    await prisma.productRatingSummary.deleteMany({ where: { productId } });
    await prisma.sellerRatingSummary.deleteMany({ where: { sellerId } });
    await prisma.trackingEvent.deleteMany({ where: { shipment: { orderId } } });
    await prisma.shipment.deleteMany({ where: { orderId } });
    await prisma.fulfillmentOrder.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.offer.deleteMany({ where: { variant: { productId } } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.seller.deleteMany({ where: { id: sellerId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function token(userId: string, role: Role): Promise<string> {
    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: `reviews-http:${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    return jwt.signAsync({ sub: userId, role, sid: session.id });
  }

  async function seedDeliveredOrder(): Promise<void> {
    const suffix = randomUUID().slice(0, 8);
    storefrontSlug = `http-review-seller-${suffix}`;
    productSlug = `http-review-product-${suffix}`;
    const [buyer, owner, admin] = await Promise.all([
      prisma.user.create({
        data: {
          email: `review-buyer-${suffix}@example.test`,
          passwordHash: 'x',
        },
      }),
      prisma.user.create({
        data: {
          email: `review-seller-${suffix}@example.test`,
          passwordHash: 'x',
          role: 'SELLER',
        },
      }),
      prisma.user.create({
        data: {
          email: `review-admin-${suffix}@example.test`,
          passwordHash: 'x',
          role: 'ADMIN',
        },
      }),
    ]);
    userIds.push(buyer.id, owner.id, admin.id);
    buyerToken = await token(buyer.id, buyer.role);
    sellerToken = await token(owner.id, owner.role);
    adminToken = await token(admin.id, admin.role);
    const seller = await prisma.seller.create({
      data: {
        ownerUserId: owner.id,
        businessName: `Review Seller ${suffix}`,
        registrationNumber: `REV-${suffix}`,
        country: 'ZM',
        businessAddress: '1 Review Street',
        contactEmail: `review-seller-${suffix}@example.test`,
        status: 'APPROVED',
        storefrontSlug,
        displayName: 'HTTP Review Seller',
      },
    });
    sellerId = seller.id;
    const product = await prisma.product.create({
      data: {
        name: `Review Product ${suffix}`,
        slug: productSlug,
        status: 'PUBLISHED',
      },
    });
    productId = product.id;
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        skuCode: `HTTP-REV-${suffix}`,
        status: 'PUBLISHED',
      },
    });
    const offer = await prisma.offer.create({
      data: { variantId: variant.id, sellerId, status: 'PUBLISHED' },
    });
    const order = await prisma.order.create({
      data: {
        userId: buyer.id,
        status: 'PAID',
        currency: 'ZMW',
        subtotal: 1_000,
        total: 1_000,
        shippingAddress: {
          line1: '1 Buyer Street',
          city: 'Lusaka',
          country: 'ZM',
        },
      },
    });
    orderId = order.id;
    const sellerOrder = await prisma.sellerOrder.create({
      data: {
        orderId,
        sellerId,
        status: 'PAID',
        subtotal: 1_000,
        total: 1_000,
        currency: 'ZMW',
      },
    });
    sellerOrderId = sellerOrder.id;
    const group = await prisma.shippingGroup.create({
      data: {
        orderId,
        sellerOrderId,
        fulfillmentMode: 'PLATFORM',
        serviceLevel: 'STANDARD',
        rateCode: 'HTTP_REVIEW',
        methodCode: 'HTTP_REVIEW',
        methodName: 'Review delivery',
        subtotal: 1_000,
        shippingAmount: 0,
        total: 1_000,
        currency: 'ZMW',
        quoteId: `quote-${suffix}`,
        quoteExpiresAt: new Date(Date.now() + 3_600_000),
        estimatedDeliveryMinDays: 1,
        estimatedDeliveryMaxDays: 2,
      },
    });
    const item = await prisma.orderItem.create({
      data: {
        orderId,
        sellerOrderId,
        shippingGroupId: group.id,
        offerId: offer.id,
        quantity: 1,
        unitAmount: 1_000,
        currency: 'ZMW',
        lineTotal: 1_000,
      },
    });
    orderItemId = item.id;
    const fulfillment = await prisma.fulfillmentOrder.create({
      data: {
        fulfillmentNumber: `HTTP-REV-FUL-${suffix}`,
        orderId,
        sellerOrderId,
        shippingGroupId: group.id,
        status: 'DISPATCHED',
      },
    });
    const line = await prisma.fulfillmentLine.create({
      data: {
        fulfillmentOrderId: fulfillment.id,
        orderItemId,
        variantId: variant.id,
        allocatedQuantity: 1,
        pickedQuantity: 1,
        packedQuantity: 1,
        shipmentAssignedQuantity: 1,
        dispatchedQuantity: 1,
      },
    });
    const shipment = await prisma.shipment.create({
      data: {
        shipmentNumber: `HTTP-REV-SHP-${suffix}`,
        orderId,
        sellerOrderId,
        shippingGroupId: group.id,
        fulfillmentOrderId: fulfillment.id,
        providerCode: 'MANUAL',
        carrierCode: 'MANUAL',
        methodCode: 'HTTP_REVIEW',
        trackingReference: `HTTP-REV-${suffix}`,
        status: 'DELIVERED',
        bookingIdempotencyKey: randomUUID(),
        bookedAt: new Date(Date.now() - 86_400_000),
        dispatchedAt: new Date(Date.now() - 43_200_000),
        deliveredAt: new Date(Date.now() - 1_000),
      },
    });
    await prisma.shipmentLine.create({
      data: {
        shipmentId: shipment.id,
        fulfillmentLineId: line.id,
        orderItemId,
        quantity: 1,
      },
    });
  }

  it('covers customer, public, seller and admin review workflows', async () => {
    const server = app.getHttpServer() as Server;
    const eligibility = await request(server)
      .get(`/api/v1/reviews/eligibility?orderId=${orderId}`)
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(200);
    expect(eligibility.body.data.products[0]).toMatchObject({
      eligible: true,
      orderItemId,
    });

    const review = await request(server)
      .post('/api/v1/reviews/products')
      .set('authorization', `Bearer ${buyerToken}`)
      .send({
        orderItemId,
        rating: 5,
        title: 'Excellent',
        body: 'Excellent product and delivery.',
      })
      .expect(201);
    productReviewId = review.body.data.id as string;
    expect(review.body.data.verifiedAt).toEqual(expect.any(String));

    const rating = await request(server)
      .post('/api/v1/reviews/sellers')
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ sellerOrderId, rating: 4, comment: 'Helpful seller.' })
      .expect(201);
    sellerRatingId = rating.body.data.id as string;

    await request(server)
      .patch(`/api/v1/reviews/sellers/${sellerRatingId}`)
      .set('authorization', `Bearer ${buyerToken}`)
      .set('idempotency-key', randomUUID())
      .send({
        version: rating.body.data.version,
        comment: 'Helpful seller with quick communication.',
      })
      .expect(200);

    await request(server)
      .patch(`/api/v1/reviews/products/${productReviewId}`)
      .set('authorization', `Bearer ${buyerToken}`)
      .set('idempotency-key', randomUUID())
      .send({
        version: review.body.data.version,
        body: 'Excellent product, delivery, and packaging.',
      })
      .expect(200);

    const publicReviews = await request(server)
      .get(
        `/api/v1/catalog/products/${productSlug}/reviews?rating=5&sort=newest`,
      )
      .expect(200);
    expect(publicReviews.body.data.data).toHaveLength(1);
    expect(publicReviews.body.data.data[0]).toMatchObject({
      verifiedPurchase: true,
      rating: 5,
    });

    const publicRatings = await request(server)
      .get(`/api/v1/storefronts/${storefrontSlug}/ratings`)
      .expect(200);
    expect(publicRatings.body.data.data).toHaveLength(1);

    const own = await request(server)
      .get('/api/v1/reviews/me')
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(200);
    expect(own.body.data.items).toHaveLength(2);

    const sellerReviews = await request(server)
      .get('/api/v1/sellers/me/reviews')
      .set('authorization', `Bearer ${sellerToken}`)
      .expect(200);
    expect(sellerReviews.body.data.data).toHaveLength(1);
    const sellerRatings = await request(server)
      .get('/api/v1/sellers/me/ratings')
      .set('authorization', `Bearer ${sellerToken}`)
      .expect(200);
    expect(sellerRatings.body.data.data).toHaveLength(1);

    const sellerModerationDetail = await request(server)
      .get(`/api/v1/admin/reviews/seller/${sellerRatingId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .post(`/api/v1/admin/reviews/seller/${sellerRatingId}/approve`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({ version: sellerModerationDetail.body.data.version })
      .expect(201);
    const sellerReport = await request(server)
      .post(`/api/v1/reviews/sellers/${sellerRatingId}/reports`)
      .set('authorization', `Bearer ${sellerToken}`)
      .set('idempotency-key', randomUUID())
      .send({ reason: 'SPAM', details: 'Seller rating report route test' })
      .expect(201);
    await request(server)
      .post(
        `/api/v1/admin/review-reports/${String(sellerReport.body.data.id)}/dismiss`,
      )
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({ reason: 'Legitimate customer feedback' })
      .expect(201);

    const approveDetail = await request(server)
      .get(`/api/v1/admin/reviews/product/${productReviewId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .post(`/api/v1/admin/reviews/product/${productReviewId}/approve`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({ version: approveDetail.body.data.version })
      .expect(201);

    const report = await request(server)
      .post(`/api/v1/reviews/products/${productReviewId}/reports`)
      .set('authorization', `Bearer ${sellerToken}`)
      .set('idempotency-key', randomUUID())
      .send({ reason: 'HARASSMENT', details: 'Seller escalation test' })
      .expect(201);
    reportId = report.body.data.id as string;

    const unreportedQueue = await request(server)
      .get('/api/v1/admin/reviews?hasOpenReport=false')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      unreportedQueue.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(productReviewId);

    await request(server)
      .get('/api/v1/admin/reviews?hasOpenReport=invalid')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(server)
      .get('/api/v1/admin/reviews')
      .set('authorization', `Bearer ${sellerToken}`)
      .expect(403);

    const queue = await request(server)
      .get('/api/v1/admin/reviews?hasOpenReport=true')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      queue.body.data.items.map((item: { id: string }) => item.id),
    ).toContain(productReviewId);

    await request(server)
      .post(`/api/v1/admin/review-reports/${reportId}/dismiss`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({ reason: 'No policy violation' })
      .expect(201);

    let detail = await request(server)
      .get(`/api/v1/admin/reviews/product/${productReviewId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .post(`/api/v1/admin/reviews/product/${productReviewId}/hide`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({ version: detail.body.data.version, reason: 'Moderation test' })
      .expect(201);
    detail = await request(server)
      .get(`/api/v1/admin/reviews/product/${productReviewId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .post(`/api/v1/admin/reviews/product/${productReviewId}/restore`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({ version: detail.body.data.version, reason: 'Restore test' })
      .expect(201);
    detail = await request(server)
      .get(`/api/v1/admin/reviews/product/${productReviewId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .post(`/api/v1/admin/reviews/product/${productReviewId}/remove`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({
        version: detail.body.data.version,
        reason: 'Terminal moderation test',
      })
      .expect(201);

    await request(server)
      .delete(`/api/v1/reviews/sellers/${sellerRatingId}`)
      .set('authorization', `Bearer ${buyerToken}`)
      .set('idempotency-key', randomUUID())
      .expect(200);
  });
});
