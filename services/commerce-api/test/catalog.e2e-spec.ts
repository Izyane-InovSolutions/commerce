import {
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { FakePrismaService } from './support/fake-prisma.service';

type Body<T> = { data: T };

describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let customerToken: string;

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

    jwtService = app.get(JwtService);
    adminToken = await jwtService.signAsync({
      sub: 'admin-1',
      role: Role.ADMIN,
      sid: 'session-admin',
    });
    customerToken = await jwtService.signAsync({
      sub: 'customer-1',
      role: Role.CUSTOMER,
      sid: 'session-customer',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): Server => app.getHttpServer() as Server;
  const asAdmin = (): { Authorization: string } => ({
    Authorization: `Bearer ${adminToken}`,
  });
  const asCustomer = (): { Authorization: string } => ({
    Authorization: `Bearer ${customerToken}`,
  });

  it('rejects a customer creating a category', async () => {
    await request(server())
      .post('/api/v1/admin/catalog/categories')
      .set(asCustomer())
      .send({ name: 'Shoes', slug: 'shoes' })
      .expect(403);
  });

  it('walks a product from draft through to a published, priced, publicly-visible listing', async () => {
    const category = (
      await request(server())
        .post('/api/v1/admin/catalog/categories')
        .set(asAdmin())
        .send({ name: 'Footwear', slug: 'footwear' })
        .expect(201)
    ).body as Body<{ id: string }>;

    const brand = (
      await request(server())
        .post('/api/v1/admin/catalog/brands')
        .set(asAdmin())
        .send({ name: 'Acme', slug: 'acme' })
        .expect(201)
    ).body as Body<{ id: string }>;

    const product = (
      await request(server())
        .post('/api/v1/admin/catalog/products')
        .set(asAdmin())
        .send({
          name: 'Trail Runner',
          slug: 'trail-runner',
          brandId: brand.data.id,
          categoryId: category.data.id,
        })
        .expect(201)
    ).body as Body<{ id: string }>;

    // Draft product is invisible on the public list and detail routes.
    const draftList = (
      await request(server()).get('/api/v1/catalog/products').expect(200)
    ).body as Body<{ data: unknown[] }>;
    expect(draftList.data.data).toHaveLength(0);
    await request(server())
      .get('/api/v1/catalog/products/trail-runner')
      .expect(404);

    const variant = (
      await request(server())
        .post(`/api/v1/admin/catalog/products/${product.data.id}/variants`)
        .set(asAdmin())
        .send({ skuCode: 'TR-42' })
        .expect(201)
    ).body as Body<{ id: string }>;

    const offer = (
      await request(server())
        .post('/api/v1/admin/catalog/offers')
        .set(asAdmin())
        .send({ variantId: variant.data.id })
        .expect(201)
    ).body as Body<{ id: string }>;

    await request(server())
      .post(`/api/v1/admin/catalog/offers/${offer.data.id}/prices`)
      .set(asAdmin())
      .send({ amount: 12999, currency: 'USD' })
      .expect(201);

    await request(server())
      .patch(
        `/api/v1/admin/catalog/products/${product.data.id}/variants/${variant.data.id}/status`,
      )
      .set(asAdmin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    await request(server())
      .patch(`/api/v1/admin/catalog/offers/${offer.data.id}/status`)
      .set(asAdmin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    await request(server())
      .patch(`/api/v1/admin/catalog/products/${product.data.id}/status`)
      .set(asAdmin())
      .send({ status: 'PUBLISHED' })
      .expect(200);

    const publicDetail = (
      await request(server())
        .get('/api/v1/catalog/products/trail-runner?currency=USD')
        .expect(200)
    ).body as Body<{
      variants: {
        skuCode: string;
        offers: { currentPrice: { amount: number; currency: string } | null }[];
      }[];
    }>;

    expect(publicDetail.data.variants[0]?.skuCode).toBe('TR-42');
    expect(publicDetail.data.variants[0]?.offers[0]?.currentPrice).toEqual({
      amount: 12999,
      currency: 'USD',
    });

    const publicList = (
      await request(server())
        .get('/api/v1/catalog/products')
        .query({ categorySlug: 'footwear', brandSlug: 'acme' })
        .expect(200)
    ).body as Body<{ data: { slug: string }[] }>;
    expect(publicList.data.data.map((entry) => entry.slug)).toContain(
      'trail-runner',
    );
  });
});
