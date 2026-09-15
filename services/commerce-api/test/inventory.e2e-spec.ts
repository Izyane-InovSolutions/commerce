import {
  ConflictException,
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { JobWorkerService } from '../src/infrastructure/jobs/job-worker.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { FakePrismaService } from './support/fake-prisma.service';
import { issueTestToken } from './support/issue-test-token';

type Body<T> = { data: T };

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let inventoryService: InventoryService;
  let jobWorkerService: JobWorkerService;
  let adminToken: string;

  beforeAll(async () => {
    const fakePrisma = new FakePrismaService();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
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

    inventoryService = app.get(InventoryService);
    jobWorkerService = app.get(JobWorkerService);
    const jwtService = app.get(JwtService);
    adminToken = await issueTestToken(
      jwtService,
      fakePrisma,
      'admin-1',
      Role.ADMIN,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): Server => app.getHttpServer() as Server;
  const asAdmin = (): { Authorization: string } => ({
    Authorization: `Bearer ${adminToken}`,
  });

  it('receives stock, reserves and releases it, and keeps available-stock accurate throughout', async () => {
    const variantId = randomUUID();

    const warehouse = (
      await request(server())
        .post('/api/v1/admin/inventory/warehouses')
        .set(asAdmin())
        .send({ name: 'Main Warehouse', code: 'MAIN' })
        .expect(201)
    ).body as Body<{ id: string }>;

    const receipt = (
      await request(server())
        .post('/api/v1/admin/inventory/receive')
        .set(asAdmin())
        .send({ warehouseId: warehouse.data.id, variantId, quantity: 20 })
        .expect(201)
    ).body as Body<{
      id: string;
      onHand: number;
      reserved: number;
      available: number;
    }>;

    expect(receipt.data).toMatchObject({
      onHand: 20,
      reserved: 0,
      available: 20,
    });

    // reserve/release have no HTTP surface yet (no cart/checkout to call them) —
    // exercised directly through the service, as documented in the plan.
    const reservation = await inventoryService.reserve(variantId, 5, {
      holderType: 'test',
      holderId: 'holder-1',
    });

    const afterReserve = (
      await request(server())
        .get('/api/v1/admin/inventory')
        .set(asAdmin())
        .query({ variantId })
        .expect(200)
    ).body as Body<{ onHand: number; reserved: number; available: number }[]>;
    expect(afterReserve.data[0]).toMatchObject({
      onHand: 20,
      reserved: 5,
      available: 15,
    });

    const movements = (
      await request(server())
        .get(`/api/v1/admin/inventory/${receipt.data.id}/movements`)
        .set(asAdmin())
        .expect(200)
    ).body as Body<{ type: string }[]>;
    expect(movements.data.map((movement) => movement.type)).toEqual(
      expect.arrayContaining(['RECEIPT', 'RESERVATION']),
    );

    await inventoryService.release(reservation.id);

    const afterRelease = (
      await request(server())
        .get('/api/v1/admin/inventory')
        .set(asAdmin())
        .query({ variantId })
        .expect(200)
    ).body as Body<{ onHand: number; reserved: number; available: number }[]>;
    expect(afterRelease.data[0]).toMatchObject({
      onHand: 20,
      reserved: 0,
      available: 20,
    });
  });

  it('rejects reserving more than is available', async () => {
    const variantId = randomUUID();
    const warehouse = (
      await request(server())
        .post('/api/v1/admin/inventory/warehouses')
        .set(asAdmin())
        .send({ name: 'Overflow Warehouse', code: 'OVERFLOW' })
        .expect(201)
    ).body as Body<{ id: string }>;

    await request(server())
      .post('/api/v1/admin/inventory/receive')
      .set(asAdmin())
      .send({ warehouseId: warehouse.data.id, variantId, quantity: 2 })
      .expect(201);

    await expect(inventoryService.reserve(variantId, 5)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('expires a reservation via the job worker once its TTL has passed, freeing the stock', async () => {
    const variantId = randomUUID();
    const warehouse = (
      await request(server())
        .post('/api/v1/admin/inventory/warehouses')
        .set(asAdmin())
        .send({ name: 'Expiry Warehouse', code: 'EXPIRE' })
        .expect(201)
    ).body as Body<{ id: string }>;

    await request(server())
      .post('/api/v1/admin/inventory/receive')
      .set(asAdmin())
      .send({ warehouseId: warehouse.data.id, variantId, quantity: 10 })
      .expect(201);

    const reservation = await inventoryService.reserve(variantId, 4, {
      ttlSeconds: -1, // already expired, so the worker picks it up immediately
    });

    await jobWorkerService.poll();

    const afterExpiry = (
      await request(server())
        .get('/api/v1/admin/inventory')
        .set(asAdmin())
        .query({ variantId })
        .expect(200)
    ).body as Body<
      { id: string; onHand: number; reserved: number; available: number }[]
    >;
    expect(afterExpiry.data[0]).toMatchObject({
      onHand: 10,
      reserved: 0,
      available: 10,
    });

    const reservations = (
      await request(server())
        .get(`/api/v1/admin/inventory/${afterExpiry.data[0]?.id}/reservations`)
        .set(asAdmin())
        .expect(200)
    ).body as Body<{ id: string; status: string }[]>;
    expect(reservations.data.find((r) => r.id === reservation.id)?.status).toBe(
      'EXPIRED',
    );
  });

  it('commits a reservation, permanently removing stock from both onHand and reserved', async () => {
    const variantId = randomUUID();
    const warehouse = (
      await request(server())
        .post('/api/v1/admin/inventory/warehouses')
        .set(asAdmin())
        .send({ name: 'Commit Warehouse', code: 'COMMIT' })
        .expect(201)
    ).body as Body<{ id: string }>;

    await request(server())
      .post('/api/v1/admin/inventory/receive')
      .set(asAdmin())
      .send({ warehouseId: warehouse.data.id, variantId, quantity: 10 })
      .expect(201);

    const reservation = await inventoryService.reserve(variantId, 4);
    await inventoryService.commit(reservation.id);

    const afterCommit = (
      await request(server())
        .get('/api/v1/admin/inventory')
        .set(asAdmin())
        .query({ variantId })
        .expect(200)
    ).body as Body<{ onHand: number; reserved: number; available: number }[]>;
    expect(afterCommit.data[0]).toMatchObject({
      onHand: 6,
      reserved: 0,
      available: 6,
    });
  });
});
