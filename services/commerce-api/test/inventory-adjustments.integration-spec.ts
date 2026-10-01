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
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ValidationException } from '../src/common/http/validation-exception';
import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';

describe('Admin inventory adjustments (integration, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditService: AuditService;
  let token: string;
  let actorUserId: string;
  let productId: string;
  let variantId: string;
  let warehouseId: string;
  let recordId: string;

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
    auditService = app.get(AuditService);
    const jwt = app.get(JwtService);
    const suffix = randomUUID().slice(0, 8);
    const actor = await prisma.user.create({
      data: {
        email: `inventory-admin-${suffix}@example.test`,
        passwordHash: 'x',
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    actorUserId = actor.id;
    const session = await prisma.session.create({
      data: {
        userId: actor.id,
        refreshTokenHash: `inventory-adjust:${randomUUID()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    token = await jwt.signAsync({
      sub: actor.id,
      role: actor.role,
      sid: session.id,
    });
    const product = await prisma.product.create({
      data: {
        name: `Inventory adjustment ${suffix}`,
        slug: `inventory-adjustment-${suffix}`,
      },
    });
    productId = product.id;
    const variant = await prisma.productVariant.create({
      data: { productId, skuCode: `ADJUST-${suffix}` },
    });
    variantId = variant.id;
    const warehouse = await prisma.warehouse.create({
      data: {
        name: `Adjustment warehouse ${suffix}`,
        code: `ADJ-${suffix}`,
      },
    });
    warehouseId = warehouse.id;
  });

  beforeEach(async () => {
    await prisma.stockAdjustmentReceipt.deleteMany({
      where: { actorUserId },
    });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId, action: 'inventory.stock.adjusted' },
    });
    await prisma.inventoryRecord.deleteMany({
      where: { warehouseId, variantId },
    });
    const record = await prisma.inventoryRecord.create({
      data: { warehouseId, variantId, onHand: 10, reserved: 8 },
    });
    recordId = record.id;
  });

  afterAll(async () => {
    await prisma.stockAdjustmentReceipt.deleteMany({
      where: { actorUserId },
    });
    await prisma.auditEvent.deleteMany({ where: { actorUserId } });
    await prisma.inventoryRecord.deleteMany({
      where: { warehouseId, variantId },
    });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.productVariant.delete({ where: { id: variantId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.session.deleteMany({ where: { userId: actorUserId } });
    await prisma.user.delete({ where: { id: actorUserId } });
    await app.close();
  });

  function adjust(delta: number, key?: string, note?: string) {
    const call = request(app.getHttpServer() as Server)
      .post('/api/v1/admin/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({
        warehouseId,
        variantId,
        delta,
        ...(note === undefined ? {} : { note }),
      });
    return key ? call.set('Idempotency-Key', key) : call;
  }

  it('rejects onHand=10, reserved=8, delta=-5 without side effects', async () => {
    await adjust(-5, randomUUID()).expect(409);

    await expect(
      prisma.inventoryRecord.findUniqueOrThrow({ where: { id: recordId } }),
    ).resolves.toMatchObject({ onHand: 10, reserved: 8 });
    await expect(
      prisma.inventoryMovement.count({
        where: { inventoryRecordId: recordId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditEvent.count({
        where: { actorUserId, action: 'inventory.stock.adjusted' },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.stockAdjustmentReceipt.count({ where: { actorUserId } }),
    ).resolves.toBe(0);
  });

  it('records a signed movement and audit, then replays the original response', async () => {
    const key = randomUUID();
    const first = await adjust(-1, key, 'cycle count').expect(201);
    expect(first.body.data).toMatchObject({
      id: recordId,
      onHand: 9,
      reserved: 8,
      available: 1,
    });

    const replay = await adjust(-1, key, 'cycle count').expect(201);
    expect(replay.body.data).toEqual(first.body.data);
    await adjust(1, key, 'cycle count').expect(409);

    await expect(
      prisma.inventoryMovement.findMany({
        where: { inventoryRecordId: recordId },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'ADJUSTMENT',
        quantity: -1,
        note: 'cycle count',
      }),
    ]);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { actorUserId, action: 'inventory.stock.adjusted' },
    });
    expect(audit.metadata).toMatchObject({
      warehouseId,
      variantId,
      delta: -1,
      note: 'cycle count',
      before: { onHand: 10, reserved: 8, available: 2 },
      after: { onHand: 9, reserved: 8, available: 1 },
    });
    expect(audit.metadata).toHaveProperty('movementId');
    await expect(
      prisma.stockAdjustmentReceipt.count({ where: { actorUserId } }),
    ).resolves.toBe(1);
  });

  it('deduplicates two concurrent requests with the same key', async () => {
    const key = randomUUID();
    const [first, second] = await Promise.all([
      adjust(2, key).expect(201),
      adjust(2, key).expect(201),
    ]);

    expect(first.body.data).toEqual(second.body.data);
    await expect(
      prisma.inventoryRecord.findUniqueOrThrow({ where: { id: recordId } }),
    ).resolves.toMatchObject({ onHand: 12, reserved: 8 });
    await expect(
      prisma.inventoryMovement.count({
        where: { inventoryRecordId: recordId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: { actorUserId, action: 'inventory.stock.adjusted' },
      }),
    ).resolves.toBe(1);
  });

  it('serializes competing reductions at the reserved-stock floor', async () => {
    await prisma.inventoryRecord.update({
      where: { id: recordId },
      data: { onHand: 9 },
    });
    const responses = await Promise.all([
      adjust(-1, randomUUID()),
      adjust(-1, randomUUID()),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    await expect(
      prisma.inventoryRecord.findUniqueOrThrow({ where: { id: recordId } }),
    ).resolves.toMatchObject({ onHand: 8, reserved: 8 });
    await expect(
      prisma.inventoryMovement.count({
        where: { inventoryRecordId: recordId },
      }),
    ).resolves.toBe(1);
  });

  it('keeps keyless requests compatible and omits an absent note from audit metadata', async () => {
    await adjust(1).expect(201);
    await adjust(1).expect(201);

    await expect(
      prisma.inventoryRecord.findUniqueOrThrow({ where: { id: recordId } }),
    ).resolves.toMatchObject({ onHand: 12 });
    const audits = await prisma.auditEvent.findMany({
      where: { actorUserId, action: 'inventory.stock.adjusted' },
    });
    expect(audits).toHaveLength(2);
    expect(audits[0]?.metadata).not.toHaveProperty('note');
    await expect(
      prisma.stockAdjustmentReceipt.count({ where: { actorUserId } }),
    ).resolves.toBe(0);
  });

  it('rejects database integer overflow and invalid client input', async () => {
    await prisma.inventoryRecord.update({
      where: { id: recordId },
      data: { onHand: 2_147_483_647, reserved: 0 },
    });
    await adjust(1, randomUUID()).expect(409);
    await adjust(2_147_483_648).expect(400);
    await adjust(1, 'not-a-uuid').expect(400);

    await expect(
      prisma.inventoryRecord.findUniqueOrThrow({ where: { id: recordId } }),
    ).resolves.toMatchObject({ onHand: 2_147_483_647 });
  });

  it('enforces counter invariants in PostgreSQL independently of the service', async () => {
    await expect(
      prisma.$executeRaw`UPDATE inventory_records SET reserved = 11 WHERE id = ${recordId}::uuid`,
    ).rejects.toBeDefined();
    await expect(
      prisma.$executeRaw`UPDATE inventory_records SET on_hand = -1 WHERE id = ${recordId}::uuid`,
    ).rejects.toBeDefined();

    await expect(
      prisma.inventoryRecord.findUniqueOrThrow({ where: { id: recordId } }),
    ).resolves.toMatchObject({ onHand: 10, reserved: 8 });
  });

  it('rolls stock and movement back when the audit write fails', async () => {
    const auditFailure = jest
      .spyOn(auditService, 'record')
      .mockRejectedValueOnce(new Error('simulated audit failure'));
    await adjust(1, randomUUID()).expect(500);
    auditFailure.mockRestore();

    await expect(
      prisma.inventoryRecord.findUniqueOrThrow({ where: { id: recordId } }),
    ).resolves.toMatchObject({ onHand: 10, reserved: 8 });
    await expect(
      prisma.inventoryMovement.count({
        where: { inventoryRecordId: recordId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.stockAdjustmentReceipt.count({ where: { actorUserId } }),
    ).resolves.toBe(0);
  });
});
