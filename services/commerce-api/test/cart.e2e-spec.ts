import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { FakePrismaService } from './support/fake-prisma.service';

type Body<T> = { data: T };

describe('Cart (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let offerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();

    app = moduleFixture.createNestApplication();
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

    // Set up one published, priced offer for the cart to reference.
    const product = (
      await request(server())
        .post('/api/v1/admin/catalog/products')
        .set(asAdmin())
        .send({ name: 'Trail Runner', slug: 'trail-runner' })
        .expect(201)
    ).body as Body<{ id: string }>;
    const variant = (
      await request(server())
        .post(`/api/v1/admin/catalog/products/${product.data.id}/variants`)
        .set(asAdmin())
        .send({ skuCode: 'TR-1' })
        .expect(201)
    ).body as Body<{ id: string }>;
    const offer = (
      await request(server())
        .post('/api/v1/admin/catalog/offers')
        .set(asAdmin())
        .send({ variantId: variant.data.id })
        .expect(201)
    ).body as Body<{ id: string }>;
    offerId = offer.data.id;
    await request(server())
      .post(`/api/v1/admin/catalog/offers/${offerId}/prices`)
      .set(asAdmin())
      .send({ amount: 5000, currency: 'usd' })
      .expect(201);

    const warehouse = (
      await request(server())
        .post('/api/v1/admin/inventory/warehouses')
        .set(asAdmin())
        .send({ name: 'Main', code: 'MAIN' })
        .expect(201)
    ).body as Body<{ id: string }>;
    await request(server())
      .post('/api/v1/admin/inventory/receive')
      .set(asAdmin())
      .send({
        warehouseId: warehouse.data.id,
        variantId: variant.data.id,
        quantity: 20,
      })
      .expect(201);
    await request(server())
      .patch(
        `/api/v1/admin/catalog/products/${product.data.id}/variants/${variant.data.id}/status`,
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

  it('rejects fetching /cart/merge-worthy actions without real auth, but allows anonymous cart use', async () => {
    const response = await request(server()).get('/api/v1/cart').expect(200);
    const body = response.body as Body<{ items: unknown[]; subtotal: number }>;
    expect(body.data).toEqual({
      id: null,
      items: [],
      subtotal: 0,
      currency: null,
    });

    await request(server()).post('/api/v1/cart/merge').expect(401);
  });

  it('lets a guest build a cart, then merges it into the account created after login', async () => {
    const addResponse = await request(server())
      .post('/api/v1/cart/items')
      .send({ offerId, quantity: 2 })
      .expect(201);

    const guestToken = addResponse.headers['x-guest-token'] as string;
    expect(guestToken).toBeDefined();

    const addBody = addResponse.body as Body<{
      items: { offerId: string; quantity: number; isAvailable: boolean }[];
      subtotal: number;
    }>;
    expect(addBody.data.items).toEqual([
      expect.objectContaining({ offerId, quantity: 2, isAvailable: true }),
    ]);
    expect(addBody.data.subtotal).toBe(10000);

    // Reusing the guest token fetches the same cart.
    const refetch = await request(server())
      .get('/api/v1/cart')
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(
      (refetch.body as Body<{ items: unknown[] }>).data.items,
    ).toHaveLength(1);

    // Adding the same offer again increments quantity rather than duplicating the line.
    const secondAdd = await request(server())
      .post('/api/v1/cart/items')
      .set('x-guest-token', guestToken)
      .send({ offerId, quantity: 1 })
      .expect(201);
    expect(
      (secondAdd.body as Body<{ items: { quantity: number }[] }>).data.items,
    ).toEqual([expect.objectContaining({ quantity: 3 })]);

    const registerResponse = (
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email: 'cart-owner@example.com', password: 'password123' })
        .expect(201)
    ).body as Body<{ accessToken: string }>;
    const userHeaders = {
      Authorization: `Bearer ${registerResponse.data.accessToken}`,
    };

    // Before merging, the user's own cart is empty.
    const beforeMerge = await request(server())
      .get('/api/v1/cart')
      .set(userHeaders)
      .expect(200);
    expect(
      (beforeMerge.body as Body<{ items: unknown[] }>).data.items,
    ).toHaveLength(0);

    const mergeResponse = await request(server())
      .post('/api/v1/cart/merge')
      .set(userHeaders)
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(
      (mergeResponse.body as Body<{ items: { quantity: number }[] }>).data
        .items,
    ).toEqual([expect.objectContaining({ quantity: 3 })]);

    // The guest cart is now merged away; presenting its token starts a fresh guest cart.
    const afterMerge = await request(server())
      .get('/api/v1/cart')
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(
      (afterMerge.body as Body<{ items: unknown[] }>).data.items,
    ).toHaveLength(0);
  });

  it('rejects adding an offer that is not published', async () => {
    const draftProduct = (
      await request(server())
        .post('/api/v1/admin/catalog/products')
        .set(asAdmin())
        .send({ name: 'Draft Item', slug: 'draft-item' })
        .expect(201)
    ).body as Body<{ id: string }>;
    const draftVariant = (
      await request(server())
        .post(`/api/v1/admin/catalog/products/${draftProduct.data.id}/variants`)
        .set(asAdmin())
        .send({ skuCode: 'DRAFT-1' })
        .expect(201)
    ).body as Body<{ id: string }>;
    const draftOffer = (
      await request(server())
        .post('/api/v1/admin/catalog/offers')
        .set(asAdmin())
        .send({ variantId: draftVariant.data.id })
        .expect(201)
    ).body as Body<{ id: string }>;

    await request(server())
      .post('/api/v1/cart/items')
      .send({ offerId: draftOffer.data.id, quantity: 1 })
      .expect(400);
  });
});
