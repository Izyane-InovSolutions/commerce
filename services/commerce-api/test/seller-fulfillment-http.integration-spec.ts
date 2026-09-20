/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unsafe-member-access */
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
import { FulfillmentProvisioningService } from '../src/modules/fulfillment/provisioning/fulfillment-provisioning.service';

type FulfillmentFixture = {
  ownerUserId: string;
  sellerId: string;
  sellerOrderId: string;
  orderId: string;
  orderItemId: string;
  fulfillmentOrderId: string;
  fulfillmentLineId: string;
  productId: string;
  offerId: string;
  token: string;
};

describe('Seller fulfillment HTTP API (#37, integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let provisioning: FulfillmentProvisioningService;
  const fixtures: FulfillmentFixture[] = [];
  const userIds: string[] = [];

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
    provisioning = app.get(FulfillmentProvisioningService);
    fixtures.push(await createFixture(3), await createFixture(1));
  });

  afterAll(async () => {
    const orderIds = fixtures.map((fixture) => fixture.orderId);
    const sellerIds = fixtures.map((fixture) => fixture.sellerId);
    const productIds = fixtures.map((fixture) => fixture.productId);
    const fulfillmentIds = fixtures.map(
      (fixture) => fixture.fulfillmentOrderId,
    );
    await prisma.refundCase.deleteMany({
      where: { sellerOrderId: { in: fixtures.map((f) => f.sellerOrderId) } },
    });
    await prisma.returnRequest.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.fulfillmentDispatch.deleteMany({
      where: { fulfillmentOrderId: { in: fulfillmentIds } },
    });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.fulfillmentOrder.deleteMany({
      where: { id: { in: fulfillmentIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.reservation.deleteMany({
      where: {
        inventoryRecord: { offerId: { in: fixtures.map((f) => f.offerId) } },
      },
    });
    await prisma.inventoryMovement.deleteMany({
      where: {
        inventoryRecord: { offerId: { in: fixtures.map((f) => f.offerId) } },
      },
    });
    await prisma.inventoryRecord.deleteMany({
      where: { offerId: { in: fixtures.map((f) => f.offerId) } },
    });
    await prisma.offer.deleteMany({
      where: { id: { in: fixtures.map((f) => f.offerId) } },
    });
    await prisma.productVariant.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.seller.deleteMany({ where: { id: { in: sellerIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function token(userId: string, role: Role): Promise<string> {
    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: `seller-fulfillment-http:${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    return jwt.signAsync({ sub: userId, role, sid: session.id });
  }

  async function createFixture(quantity: number): Promise<FulfillmentFixture> {
    const suffix = randomUUID().slice(0, 8);
    const owner = await prisma.user.create({
      data: {
        email: `fulfillment-http-seller-${suffix}@example.test`,
        passwordHash: 'x',
        role: 'SELLER',
      },
    });
    const buyer = await prisma.user.create({
      data: {
        email: `fulfillment-http-buyer-${suffix}@example.test`,
        passwordHash: 'x',
      },
    });
    userIds.push(owner.id, buyer.id);
    const seller = await prisma.seller.create({
      data: {
        ownerUserId: owner.id,
        businessName: `Fulfillment Seller ${suffix}`,
        registrationNumber: `FUL-HTTP-${suffix}`,
        country: 'ZM',
        businessAddress: '1 Seller Street',
        contactEmail: `fulfillment-${suffix}@example.test`,
        status: 'APPROVED',
      },
    });
    const product = await prisma.product.create({
      data: {
        name: `Fulfillment Product ${suffix}`,
        slug: `ful-http-${suffix}`,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, skuCode: `FUL-HTTP-${suffix}` },
    });
    const offer = await prisma.offer.create({
      data: {
        variantId: variant.id,
        sellerId: seller.id,
        stockSource: 'SELLER',
        fulfillmentMode: 'SELLER',
      },
    });
    const inventory = await prisma.inventoryRecord.create({
      data: {
        offerId: offer.id,
        variantId: variant.id,
        onHand: quantity + 20,
        reserved: quantity,
      },
    });
    const reservation = await prisma.reservation.create({
      data: {
        holderId: `http-${suffix}`,
        inventoryRecordId: inventory.id,
        quantity,
        status: 'COMMITTED',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: buyer.id,
        status: 'PAID',
        currency: 'ZMW',
        subtotal: 1_000 * quantity,
        total: 1_000 * quantity,
        shippingAddress: {
          fullName: 'Buyer Name',
          phone: '+260970000000',
          line1: '12 Private Road',
          city: 'Lusaka',
          country: 'ZM',
        },
      },
    });
    const sellerOrder = await prisma.sellerOrder.create({
      data: {
        orderId: order.id,
        sellerId: seller.id,
        status: 'PAID',
        subtotal: 1_000 * quantity,
        total: 1_000 * quantity,
        currency: 'ZMW',
      },
    });
    const group = await prisma.shippingGroup.create({
      data: {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        fulfillmentMode: 'SELLER',
        serviceLevel: 'STANDARD',
        rateCode: 'SELLER_STANDARD_V1',
        methodCode: 'SELLER_STANDARD_V1',
        methodName: 'Seller delivery',
        subtotal: 1_000 * quantity,
        shippingAmount: 0,
        total: 1_000 * quantity,
        currency: 'ZMW',
        quoteId: `quote-${suffix}`,
        quoteExpiresAt: new Date(Date.now() + 3_600_000),
        estimatedDeliveryMinDays: 2,
        estimatedDeliveryMaxDays: 5,
      },
    });
    const item = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        sellerOrderId: sellerOrder.id,
        shippingGroupId: group.id,
        offerId: offer.id,
        quantity,
        unitAmount: 1_000,
        currency: 'ZMW',
        lineTotal: 1_000 * quantity,
        reservationId: reservation.id,
      },
    });
    await provisioning.provisionForOrder(order.id);
    const fulfillment = await prisma.fulfillmentOrder.findFirstOrThrow({
      where: { shippingGroupId: group.id, warehouseId: null },
      include: { lines: true },
    });
    return {
      ownerUserId: owner.id,
      sellerId: seller.id,
      sellerOrderId: sellerOrder.id,
      orderId: order.id,
      orderItemId: item.id,
      fulfillmentOrderId: fulfillment.id,
      fulfillmentLineId: fulfillment.lines[0]!.id,
      productId: product.id,
      offerId: offer.id,
      token: await token(owner.id, owner.role),
    };
  }

  it('covers the seller queue, ownership boundary and fulfillment commands', async () => {
    const [fixture, other] = fixtures;
    const server = app.getHttpServer() as Server;
    const list = await request(server)
      .get('/api/v1/sellers/me/orders?fulfillmentStatus=AWAITING_ACCEPTANCE')
      .set('authorization', `Bearer ${fixture!.token}`)
      .expect(200);
    expect(list.body.data.items).toHaveLength(1);

    const beforeAccept = await request(server)
      .get(`/api/v1/sellers/me/orders/${fixture!.sellerOrderId}`)
      .set('authorization', `Bearer ${fixture!.token}`)
      .expect(200);
    expect(
      beforeAccept.body.data.shippingGroups[0].destination,
    ).not.toHaveProperty('line1');
    const version = beforeAccept.body.data.shippingGroups[0]
      .fulfillmentOrders[0].version as number;
    expect(Number.isInteger(version)).toBe(true);

    await request(server)
      .get(`/api/v1/sellers/me/orders/${fixture!.sellerOrderId}`)
      .set('authorization', `Bearer ${other!.token}`)
      .expect(404);
    await request(server)
      .post(
        `/api/v1/sellers/me/fulfillments/${fixture!.fulfillmentOrderId}/accept`,
      )
      .set('authorization', `Bearer ${other!.token}`)
      .send({ version: 0 })
      .expect(404);

    await request(server)
      .post(
        `/api/v1/sellers/me/fulfillments/${fixture!.fulfillmentOrderId}/accept`,
      )
      .set('authorization', `Bearer ${fixture!.token}`)
      .send({ version })
      .expect(201);
    await request(server)
      .post(
        `/api/v1/sellers/me/fulfillments/${fixture!.fulfillmentOrderId}/reject`,
      )
      .set('authorization', `Bearer ${fixture!.token}`)
      .set('idempotency-key', randomUUID())
      .send({ version, reason: 'Stale concurrent decision' })
      .expect(409);
    const afterAccept = await request(server)
      .get(`/api/v1/sellers/me/orders/${fixture!.sellerOrderId}`)
      .set('authorization', `Bearer ${fixture!.token}`)
      .expect(200);
    expect(afterAccept.body.data.shippingGroups[0].destination).toMatchObject({
      line1: '12 Private Road',
      city: 'Lusaka',
    });

    await request(server)
      .post(
        `/api/v1/sellers/me/fulfillments/${fixture!.fulfillmentOrderId}/packs`,
      )
      .set('authorization', `Bearer ${fixture!.token}`)
      .set('idempotency-key', randomUUID())
      .send({
        lines: [{ fulfillmentLineId: fixture!.fulfillmentLineId, quantity: 2 }],
      })
      .expect(201);
    await request(server)
      .post(
        `/api/v1/sellers/me/fulfillments/${fixture!.fulfillmentOrderId}/cancellations`,
      )
      .set('authorization', `Bearer ${fixture!.token}`)
      .set('idempotency-key', randomUUID())
      .send({
        lines: [{ fulfillmentLineId: fixture!.fulfillmentLineId, quantity: 1 }],
        reason: 'Customer requested partial cancellation',
      })
      .expect(201);
    const dispatch = await request(server)
      .post(
        `/api/v1/sellers/me/fulfillments/${fixture!.fulfillmentOrderId}/dispatches`,
      )
      .set('authorization', `Bearer ${fixture!.token}`)
      .set('idempotency-key', randomUUID())
      .send({
        lines: [{ fulfillmentLineId: fixture!.fulfillmentLineId, quantity: 2 }],
        carrierCode: 'MANUAL',
        trackingReference: `SELLER-HTTP-${randomUUID()}`,
      })
      .expect(201);
    const shipmentId = dispatch.body.data.shipments[0].id as string;
    await request(server)
      .post(`/api/v1/sellers/me/shipments/${shipmentId}/tracking-events`)
      .set('authorization', `Bearer ${fixture!.token}`)
      .set('idempotency-key', randomUUID())
      .send({
        normalizedStatus: 'IN_TRANSIT',
        description: 'Collected by carrier',
        location: 'Lusaka',
        occurredAt: new Date().toISOString(),
      })
      .expect(201);

    const returns = await request(server)
      .get('/api/v1/sellers/me/returns')
      .set('authorization', `Bearer ${fixture!.token}`)
      .expect(200);
    expect(returns.body.data).toMatchObject({ items: [], total: 0 });
  });

  it('rejects a seller fulfillment and releases the entire quantity', async () => {
    const fixture = fixtures[1]!;
    await request(app.getHttpServer() as Server)
      .post(
        `/api/v1/sellers/me/fulfillments/${fixture.fulfillmentOrderId}/reject`,
      )
      .set('authorization', `Bearer ${fixture.token}`)
      .set('idempotency-key', randomUUID())
      .send({ version: 0, reason: 'Unable to fulfill this order' })
      .expect(201);
    const fulfillment = await prisma.fulfillmentOrder.findUniqueOrThrow({
      where: { id: fixture.fulfillmentOrderId },
      include: { lines: true },
    });
    expect(fulfillment.status).toBe('CANCELLED');
    expect(fulfillment.lines[0]!.cancelledQuantity).toBe(1);
  });
});
