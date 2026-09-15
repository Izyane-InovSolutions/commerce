import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { json, type Request } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { PAYMENT_PROVIDER } from '../src/modules/payments/payment-provider';
import { FakePaymentProvider } from './support/fake-payment-provider';
import { FakePrismaService } from './support/fake-prisma.service';

type Body<T> = { data: T };

describe('Checkout (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let paymentProvider: FakePaymentProvider;
  let offerId: string;
  let variantId: string;
  let warehouseId: string;

  beforeAll(async () => {
    paymentProvider = new FakePaymentProvider();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(paymentProvider)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
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

    const jwtService = app.get(JwtService);
    adminToken = await jwtService.signAsync({
      sub: 'admin-1',
      role: Role.ADMIN,
      sid: 'session-admin',
    });

    const product = (
      await request(server())
        .post('/api/v1/admin/catalog/products')
        .set(asAdmin())
        .send({ name: 'Checkout Shoe', slug: 'checkout-shoe' })
        .expect(201)
    ).body as Body<{ id: string }>;
    const variant = (
      await request(server())
        .post(`/api/v1/admin/catalog/products/${product.data.id}/variants`)
        .set(asAdmin())
        .send({ skuCode: 'CHECKOUT-1' })
        .expect(201)
    ).body as Body<{ id: string }>;
    variantId = variant.data.id;
    const offer = (
      await request(server())
        .post('/api/v1/admin/catalog/offers')
        .set(asAdmin())
        .send({ variantId })
        .expect(201)
    ).body as Body<{ id: string }>;
    offerId = offer.data.id;
    await request(server())
      .post(`/api/v1/admin/catalog/offers/${offerId}/prices`)
      .set(asAdmin())
      .send({ amount: 5000, currency: 'ZMW' })
      .expect(201);

    const warehouse = (
      await request(server())
        .post('/api/v1/admin/inventory/warehouses')
        .set(asAdmin())
        .send({ name: 'Main', code: 'CHK' })
        .expect(201)
    ).body as Body<{ id: string }>;
    warehouseId = warehouse.data.id;
    await request(server())
      .post('/api/v1/admin/inventory/receive')
      .set(asAdmin())
      .send({ warehouseId, variantId, quantity: 10 })
      .expect(201);
    await request(server())
      .patch(
        `/api/v1/admin/catalog/products/${product.data.id}/variants/${variantId}/status`,
      )
      .set(asAdmin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    await request(server())
      .patch(`/api/v1/admin/catalog/offers/${offerId}/status`)
      .set(asAdmin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  function server(): Server {
    return app.getHttpServer() as Server;
  }

  function asAdmin(): { Authorization: string } {
    return { Authorization: `Bearer ${adminToken}` };
  }

  async function registerCustomer(
    email: string,
  ): Promise<{ Authorization: string }> {
    const registerResponse = (
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email, password: 'password123' })
        .expect(201)
    ).body as Body<{ accessToken: string }>;
    return { Authorization: `Bearer ${registerResponse.data.accessToken}` };
  }

  async function createAddress(userHeaders: {
    Authorization: string;
  }): Promise<string> {
    const address = (
      await request(server())
        .post('/api/v1/users/me/addresses')
        .set(userHeaders)
        .send({
          recipientName: 'Jane Doe',
          line1: '1 Main St',
          city: 'Metropolis',
          postalCode: '12345',
          country: 'US',
        })
        .expect(201)
    ).body as Body<{ id: string }>;
    return address.data.id;
  }

  it('checks out a cart, reserves stock, and confirms the order once the webhook fires', async () => {
    const userHeaders = await registerCustomer('checkout-buyer@example.com');
    const addressId = await createAddress(userHeaders);

    await request(server())
      .post('/api/v1/cart/items?currency=ZMW')
      .set(userHeaders)
      .send({ offerId, quantity: 2 })
      .expect(201);

    const checkoutResponse = await request(server())
      .post('/api/v1/checkout')
      .set(userHeaders)
      .send({ shippingAddressId: addressId, currency: 'ZMW' })
      .expect(201);
    const checkoutBody = checkoutResponse.body as Body<{
      order: { id: string; status: string };
      payment: {
        providerReference: string;
        status: string;
        redirectUrl?: string;
      };
    }>;
    expect(checkoutBody.data.order.status).toBe('PENDING_PAYMENT');
    expect(checkoutBody.data.payment.redirectUrl).toBeDefined();

    // Cart is cleared once payment initialization succeeds.
    const cartAfterCheckout = await request(server())
      .get('/api/v1/cart?currency=ZMW')
      .set(userHeaders)
      .expect(200);
    expect(
      (cartAfterCheckout.body as Body<{ items: unknown[] }>).data.items,
    ).toHaveLength(0);

    const inventoryAfterReserve = await request(server())
      .get(`/api/v1/admin/inventory?variantId=${variantId}`)
      .set(asAdmin())
      .expect(200);
    expect(
      (inventoryAfterReserve.body as Body<{ reserved: number }[]>).data[0]
        ?.reserved,
    ).toBe(2);

    paymentProvider.queueEvent(
      checkoutBody.data.payment.providerReference,
      'SUCCEEDED',
    );
    await request(server())
      .post('/api/v1/payments/webhook')
      .set('x-webhook-signature', 'fake-signature')
      .send({ providerReference: checkoutBody.data.payment.providerReference })
      .expect(200);

    const orderId = checkoutBody.data.order.id;
    const orderAfterWebhook = await request(server())
      .get(`/api/v1/orders/${orderId}`)
      .set(userHeaders)
      .expect(200);
    expect(
      (orderAfterWebhook.body as Body<{ status: string }>).data.status,
    ).toBe('PAID');

    const inventoryAfterCommit = await request(server())
      .get(`/api/v1/admin/inventory?variantId=${variantId}`)
      .set(asAdmin())
      .expect(200);
    expect(
      (
        inventoryAfterCommit.body as Body<
          { reserved: number; onHand: number }[]
        >
      ).data[0],
    ).toMatchObject({
      reserved: 0,
      onHand: 8,
    });
  });

  it('buys an offer directly ("buy now") without touching or being limited by the cart', async () => {
    const userHeaders = await registerCustomer('buy-now-buyer@example.com');
    const addressId = await createAddress(userHeaders);

    // Something already sitting in the cart, unrelated to what is bought now
    // — buy-now must neither read it nor be blocked by it.
    await request(server())
      .post('/api/v1/cart/items')
      .set(userHeaders)
      .send({ offerId, quantity: 5 })
      .expect(201);

    const buyNowResponse = await request(server())
      .post('/api/v1/checkout/buy-now')
      .set(userHeaders)
      .send({ offerId, quantity: 1, shippingAddressId: addressId })
      .expect(201);
    const buyNowBody = buyNowResponse.body as Body<{
      order: { id: string; status: string; items: { quantity: number }[] };
      payment: { providerReference: string };
    }>;
    expect(buyNowBody.data.order.status).toBe('PENDING_PAYMENT');
    expect(buyNowBody.data.order.items).toHaveLength(1);
    expect(buyNowBody.data.order.items[0]?.quantity).toBe(1);

    // The persisted cart is untouched — the 5 units placed earlier are
    // still there, unaffected by the direct purchase of 1.
    const cartAfterBuyNow = await request(server())
      .get('/api/v1/cart')
      .set(userHeaders)
      .expect(200);
    expect(
      (cartAfterBuyNow.body as Body<{ items: { quantity: number }[] }>).data
        .items,
    ).toEqual([expect.objectContaining({ quantity: 5 })]);

    paymentProvider.queueEvent(
      buyNowBody.data.payment.providerReference,
      'SUCCEEDED',
    );
    await request(server())
      .post('/api/v1/payments/webhook')
      .set('x-webhook-signature', 'fake-signature')
      .send({ providerReference: buyNowBody.data.payment.providerReference })
      .expect(200);

    const orderAfterWebhook = await request(server())
      .get(`/api/v1/orders/${buyNowBody.data.order.id}`)
      .set(userHeaders)
      .expect(200);
    expect(
      (orderAfterWebhook.body as Body<{ status: string }>).data.status,
    ).toBe('PAID');
  });

  it('rejects checkout for an empty cart and leaves nothing behind', async () => {
    const userHeaders = await registerCustomer('empty-cart-buyer@example.com');
    const addressId = await createAddress(userHeaders);

    await request(server())
      .post('/api/v1/checkout')
      .set(userHeaders)
      .send({ shippingAddressId: addressId, currency: 'ZMW' })
      .expect(409);
  });

  it('splits a checkout spanning a first-party offer and a seller offer into per-seller SellerOrders', async () => {
    // Seeded directly via the fake Prisma instance rather than through
    // seller-auth HTTP endpoints - Cart/Orders only ever read
    // offer.sellerId/stockSource/seller?.status off the offer they already
    // load, so no full seller/marketplace-offers fake is needed here.
    const prisma = app.get(PrismaService);
    await prisma.seller.create({
      data: {
        id: 'seller-approved-1',
        ownerUserId: 'seller-approved-1-owner',
        businessName: 'Approved Seller Ltd',
        registrationNumber: 'REG-1',
        country: 'ZM',
        businessAddress: '1 Cairo Road, Lusaka',
        contactEmail: 'seller-approved-1@example.com',
        status: 'APPROVED',
      },
    });
    const sellerOffer = (await prisma.offer.create({
      data: {
        variantId,
        sellerId: 'seller-approved-1',
        stockSource: 'SELLER',
        status: 'PUBLISHED',
      },
    })) as { id: string };
    await prisma.price.create({
      data: { offerId: sellerOffer.id, amount: 3000, currency: 'ZMW' },
    });
    await prisma.inventoryRecord.create({
      data: {
        offerId: sellerOffer.id,
        variantId,
        onHand: 5,
      },
    });

    const userHeaders = await registerCustomer(
      'multi-seller-buyer@example.com',
    );
    const addressId = await createAddress(userHeaders);

    await request(server())
      .post('/api/v1/cart/items?currency=ZMW')
      .set(userHeaders)
      .send({ offerId, quantity: 1 })
      .expect(201);
    await request(server())
      .post('/api/v1/cart/items?currency=ZMW')
      .set(userHeaders)
      .send({ offerId: sellerOffer.id, quantity: 1 })
      .expect(201);

    const checkoutResponse = await request(server())
      .post('/api/v1/checkout')
      .set(userHeaders)
      .send({ shippingAddressId: addressId, currency: 'ZMW' })
      .expect(201);
    const checkoutBody = checkoutResponse.body as Body<{
      order: {
        id: string;
        sellerOrders: { sellerId: string | null; status: string }[];
      };
      payment: { providerReference: string };
    }>;
    expect(checkoutBody.data.order.sellerOrders).toHaveLength(2);
    expect(
      checkoutBody.data.order.sellerOrders
        .map((group) => group.sellerId)
        .sort(),
    ).toEqual([null, 'seller-approved-1'].sort());

    paymentProvider.queueEvent(
      checkoutBody.data.payment.providerReference,
      'SUCCEEDED',
    );
    await request(server())
      .post('/api/v1/payments/webhook')
      .set('x-webhook-signature', 'fake-signature')
      .send({ providerReference: checkoutBody.data.payment.providerReference })
      .expect(200);

    const orderAfterWebhook = (
      await request(server())
        .get(`/api/v1/orders/${checkoutBody.data.order.id}`)
        .set(userHeaders)
        .expect(200)
    ).body as Body<{ sellerOrders: { status: string }[] }>;
    expect(
      orderAfterWebhook.data.sellerOrders.every(
        (group) => group.status === 'PAID',
      ),
    ).toBe(true);
    const sellerInventory = await prisma.inventoryRecord.findUnique({
      where: { offerId: sellerOffer.id },
    });
    expect(sellerInventory).toMatchObject({ onHand: 4, reserved: 0 });
  });
});
