import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { json, type Request } from 'express';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { ValidationException } from '../../src/common/http/validation-exception';
import { PrismaService } from '../../src/database/prisma.service';
import { PAYMENT_PROVIDER } from '../../src/modules/payments/payment-provider';
import { FakePaymentProvider } from './fake-payment-provider';

/**
 * Shared harness for the checkout, payments and orders integration specs:
 * the real AppModule against the migrated test database, with only the
 * payment gateway replaced by FakePaymentProvider (the same seam
 * test/financial-integrity.database-check.cjs uses). Every row a spec
 * creates is tracked here and removed by `cleanup`, scoped to those ids.
 */
export type CheckoutHarness = {
  app: INestApplication;
  prisma: PrismaService;
  provider: FakePaymentProvider;
  server(): Server;
  /** A fresh CUSTOMER with a bearer token and one ZM shipping address. */
  createCustomer(): Promise<Customer>;
  /** A published first-party offer priced in ZMW with `onHand` units in a
   * fresh warehouse. */
  createStockedOffer(
    onHand: number,
    unitAmount?: number,
  ): Promise<StockedOffer>;
  /** Adds `quantity` of the offer to the customer's cart and checks out. */
  checkout(
    customer: Customer,
    offer: StockedOffer,
    quantity: number,
    idempotencyKey?: string,
  ): Promise<CheckoutResponse>;
  /** Delivers a gateway webhook for the payment through the public route. */
  deliverWebhook(
    providerReference: string,
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED',
  ): Promise<void>;
  stock(offer: StockedOffer): Promise<{ onHand: number; reserved: number }>;
  cleanup(): Promise<void>;
};

export type Customer = {
  userId: string;
  addressId: string;
  headers: { Authorization: string };
};

export type StockedOffer = {
  offerId: string;
  variantId: string;
  warehouseId: string;
  inventoryRecordId: string;
};

export type CheckoutResponse = {
  order: {
    id: string;
    status: string;
    total: number;
    items: { id: string; quantity: number; reservationId: string | null }[];
  };
  payment: { id: string; status: string; providerReference: string };
};

export async function createCheckoutHarness(
  label: string,
): Promise<CheckoutHarness> {
  const provider = new FakePaymentProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PAYMENT_PROVIDER)
    .useValue(provider)
    .compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  app.use(
    json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]): ValidationException =>
        new ValidationException(errors),
    }),
  );
  await app.init();

  const prisma = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const server = (): Server => app.getHttpServer() as Server;
  const userIds: string[] = [];
  const productIds: string[] = [];
  const warehouseIds: string[] = [];
  const offerIds: string[] = [];

  async function createCustomer(): Promise<Customer> {
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: {
        email: `${label}-buyer-${suffix}@example.test`,
        passwordHash: 'x',
        role: Role.CUSTOMER,
      },
    });
    userIds.push(user.id);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: `${label}:${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const token = await jwt.signAsync({
      sub: user.id,
      role: Role.CUSTOMER,
      sid: session.id,
    });
    const headers = { Authorization: `Bearer ${token}` };
    const address = await request(server())
      .post('/api/v1/users/me/addresses')
      .set(headers)
      .send({
        recipientName: 'Integration Buyer',
        line1: '1 Cairo Road',
        city: 'Lusaka',
        postalCode: '10101',
        country: 'ZM',
      })
      .expect(201);
    return {
      userId: user.id,
      addressId: (address.body as { data: { id: string } }).data.id,
      headers,
    };
  }

  async function createStockedOffer(
    onHand: number,
    unitAmount = 2_500,
  ): Promise<StockedOffer> {
    const suffix = randomUUID().slice(0, 8);
    const product = await prisma.product.create({
      data: {
        name: `${label} product ${suffix}`,
        slug: `${label}-product-${suffix}`,
        status: 'PUBLISHED',
      },
    });
    productIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        skuCode: `${label.toUpperCase()}-${suffix}`,
        status: 'PUBLISHED',
      },
    });
    const offer = await prisma.offer.create({
      data: { variantId: variant.id, status: 'PUBLISHED' },
    });
    offerIds.push(offer.id);
    await prisma.price.create({
      data: { offerId: offer.id, amount: unitAmount, currency: 'ZMW' },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        name: `${label} warehouse ${suffix}`,
        code: `${label}-${suffix}`,
      },
    });
    warehouseIds.push(warehouse.id);
    const record = await prisma.inventoryRecord.create({
      data: { warehouseId: warehouse.id, variantId: variant.id, onHand },
    });
    return {
      offerId: offer.id,
      variantId: variant.id,
      warehouseId: warehouse.id,
      inventoryRecordId: record.id,
    };
  }

  async function checkout(
    customer: Customer,
    offer: StockedOffer,
    quantity: number,
    idempotencyKey: string = randomUUID(),
  ): Promise<CheckoutResponse> {
    await request(server())
      .post('/api/v1/cart/items?currency=ZMW')
      .set(customer.headers)
      .send({ offerId: offer.offerId, quantity })
      .expect(201);
    const response = await request(server())
      .post('/api/v1/checkout')
      .set(customer.headers)
      .set('Idempotency-Key', idempotencyKey)
      .send({ shippingAddressId: customer.addressId, currency: 'ZMW' })
      .expect(201);
    return (response.body as { data: CheckoutResponse }).data;
  }

  async function deliverWebhook(
    providerReference: string,
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED',
  ): Promise<void> {
    provider.queueEvent(providerReference, status);
    await request(server())
      .post('/api/v1/payments/webhook')
      .set('x-webhook-signature', 'fake-signature')
      .send({ providerReference })
      .expect(200);
  }

  async function stock(
    offer: StockedOffer,
  ): Promise<{ onHand: number; reserved: number }> {
    return prisma.inventoryRecord.findUniqueOrThrow({
      where: { id: offer.inventoryRecordId },
      select: { onHand: true, reserved: true },
    });
  }

  async function cleanup(): Promise<void> {
    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, payment: { select: { id: true } } },
    });
    const orderIds = orders.map((order) => order.id);
    const paymentIds = orders.flatMap((order) =>
      order.payment ? [order.payment.id] : [],
    );
    const reservations = await prisma.reservation.findMany({
      where: { inventoryRecord: { warehouseId: { in: warehouseIds } } },
      select: { id: true },
    });
    const jobKeys = [
      ...orderIds.map((id) => ['orderId', id] as const),
      ...paymentIds.map((id) => ['paymentId', id] as const),
      ...reservations.map((row) => ['reservationId', row.id] as const),
    ];
    for (const [key, id] of jobKeys) {
      await prisma.backgroundJob.deleteMany({
        where: { payload: { path: [key], equals: id } },
      });
    }
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...orderIds, ...paymentIds] } },
    });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    // Orders (and their items, payments and payment events) cascade from
    // the user; stock rows, movements and reservations from the warehouse.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.offer.deleteMany({ where: { id: { in: offerIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await app.close();
  }

  return {
    app,
    prisma,
    provider,
    server,
    createCustomer,
    createStockedOffer,
    checkout,
    deliverWebhook,
    stock,
    cleanup,
  };
}
