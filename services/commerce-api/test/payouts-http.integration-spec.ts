/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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

describe('Seller payout HTTP API (#36, integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let ownerUserId: string;
  let adminUserId: string;
  let sellerId: string;
  let sellerToken: string;
  let adminToken: string;
  let payoutAccountId: string;
  let payoutRequestId: string;

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

    const suffix = randomUUID().slice(0, 8);
    const owner = await prisma.user.create({
      data: {
        email: `http-payout-seller-${suffix}@example.test`,
        passwordHash: 'x',
        role: 'SELLER',
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: `http-payout-admin-${suffix}@example.test`,
        passwordHash: 'x',
        role: 'ADMIN',
      },
    });
    ownerUserId = owner.id;
    adminUserId = admin.id;
    const seller = await prisma.seller.create({
      data: {
        ownerUserId,
        businessName: `HTTP Payout Seller ${suffix}`,
        registrationNumber: `HTTP-PAYOUT-${suffix}`,
        country: 'ZM',
        businessAddress: '1 HTTP Street',
        contactEmail: `http-payout-${suffix}@example.test`,
        status: 'APPROVED',
      },
    });
    sellerId = seller.id;
    await prisma.sellerBalance.create({
      data: { sellerId, balance: 5_000, currency: 'ZMW' },
    });
    sellerToken = await issueToken(owner.id, owner.role);
    adminToken = await issueToken(admin.id, admin.role);
  });

  afterAll(async () => {
    if (!prisma || !sellerId) {
      await app?.close();
      return;
    }
    const batches = await prisma.payoutBatch.findMany({
      where: { requests: { some: { sellerId } } },
      select: { id: true },
    });
    if (payoutRequestId) {
      await prisma.payoutRequestEvent.deleteMany({
        where: { payoutRequestId },
      });
      await prisma.payoutAttempt.deleteMany({ where: { payoutRequestId } });
    }
    await prisma.payout.deleteMany({ where: { sellerId } });
    await prisma.sellerPayoutRequest.deleteMany({ where: { sellerId } });
    await prisma.payoutBatch.deleteMany({
      where: {
        id: { in: batches.map((batch) => batch.id) },
        requests: { none: {} },
      },
    });
    await prisma.sellerPayoutAccount.deleteMany({ where: { sellerId } });
    await prisma.ledgerEntry.deleteMany({ where: { sellerId } });
    await prisma.sellerBalance.deleteMany({ where: { sellerId } });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: [ownerUserId, adminUserId] } },
    });
    await prisma.seller.deleteMany({ where: { id: sellerId } });
    await prisma.session.deleteMany({
      where: { userId: { in: [ownerUserId, adminUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, adminUserId] } },
    });
    await app.close();
  });

  async function issueToken(userId: string, role: Role): Promise<string> {
    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: `http-payout:${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      },
    });
    return jwt.signAsync({ sub: userId, role, sid: session.id });
  }

  it('creates, verifies, requests, approves, processes and reconciles a payout', async () => {
    const accountResponse = await request(app.getHttpServer() as Server)
      .post('/api/v1/sellers/me/payout-accounts')
      .set('authorization', `Bearer ${sellerToken}`)
      .send({
        method: 'MOBILE_MONEY',
        provider: 'MTN MoMo',
        accountHolderName: 'HTTP Seller',
        destination: { phoneNumber: '+260961112222' },
      })
      .expect(201);
    payoutAccountId = accountResponse.body.data.id as string;
    expect(accountResponse.body.data.maskedReference).toMatch(/2222$/);
    expect(accountResponse.body.data).not.toHaveProperty('destination');

    await request(app.getHttpServer() as Server)
      .post(`/api/v1/admin/payout-accounts/${payoutAccountId}/verify`)
      .set('authorization', `Bearer ${sellerToken}`)
      .send({ status: 'VERIFIED', note: 'Verified', version: 0 })
      .expect(403);

    await request(app.getHttpServer() as Server)
      .post(`/api/v1/admin/payout-accounts/${payoutAccountId}/verify`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ status: 'VERIFIED', note: 'Verified', version: 0 })
      .expect(201);

    const payoutResponse = await request(app.getHttpServer() as Server)
      .post('/api/v1/sellers/me/payout-requests')
      .set('authorization', `Bearer ${sellerToken}`)
      .set('idempotency-key', randomUUID())
      .send({ payoutAccountId, amount: 2_000 })
      .expect(201);
    payoutRequestId = payoutResponse.body.data.id as string;
    expect(payoutResponse.body.data.status).toBe('REQUESTED');

    await request(app.getHttpServer() as Server)
      .post(`/api/v1/admin/payout-requests/${payoutRequestId}/approve`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({ version: payoutResponse.body.data.version })
      .expect(201);

    await request(app.getHttpServer() as Server)
      .post('/api/v1/admin/payout-batches/process')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(201);

    const detail = await request(app.getHttpServer() as Server)
      .get(`/api/v1/admin/payout-requests/${payoutRequestId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.data.status).toBe('RECONCILIATION_REQUIRED');

    await request(app.getHttpServer() as Server)
      .post(`/api/v1/admin/payout-requests/${payoutRequestId}/resolve`)
      .set('authorization', `Bearer ${adminToken}`)
      .set('idempotency-key', randomUUID())
      .send({
        outcome: 'SUCCEEDED',
        providerReference: 'http-bank-confirmation',
        note: 'Matched to statement',
        version: detail.body.data.version,
      })
      .expect(201);

    const balance = await request(app.getHttpServer() as Server)
      .get('/api/v1/sellers/me/balance')
      .set('authorization', `Bearer ${sellerToken}`)
      .expect(200);
    expect(balance.body.data).toMatchObject({
      availableBalance: 3_000,
      pendingPayoutBalance: 0,
      paidBalance: 2_000,
    });
  });
});
