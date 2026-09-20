/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import {
  PayoutAccountMethod,
  PayoutAccountStatus,
  SellerPayoutStatus,
} from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { PayoutResolutionOutcome } from '../src/modules/financials/dto/payout-request.dto';
import { LedgerService } from '../src/modules/financials/ledger.service';
import type {
  PayoutProvider,
  PayoutProviderResult,
} from '../src/modules/financials/payouts/payout-provider';
import { PayoutsService } from '../src/modules/financials/payouts/payouts.service';
import type { SellersService } from '../src/modules/sellers/sellers.service';

describe('Seller payouts (#36, integration, real Postgres)', () => {
  const prisma = new PrismaService();
  const config = new ConfigService({
    MARKETPLACE_COMMISSION_BPS: 1000,
    SELLER_PAYOUT_HOLD_DAYS: 0,
    SELLER_PAYOUT_MINIMUM_MINOR: 10,
  });
  const audit = new AuditService(prisma);
  const ledger = new LedgerService(prisma, config);
  const providerResults: PayoutProviderResult[] = [];
  const provider: PayoutProvider = {
    name: 'test-provider',
    submit: jest.fn(() => {
      const result = providerResults.shift();
      if (!result) {
        return Promise.reject(
          new Error('No fake payout provider result queued'),
        );
      }
      return Promise.resolve(result);
    }),
  };

  let ownerUserId: string;
  let adminUserId: string;
  let sellerId: string;
  let payoutAccountId: string;
  const requestIds: string[] = [];

  const sellers = {
    requireApproved: async (userId: string) => {
      const seller = await prisma.seller.findFirst({
        where: { ownerUserId: userId, status: 'APPROVED' },
      });
      if (!seller) throw new Error('Approved seller expected');
      return seller;
    },
  } as unknown as SellersService;

  const service = new PayoutsService(
    prisma,
    config,
    sellers,
    ledger,
    audit,
    provider,
  );

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = randomUUID().slice(0, 8);
    const owner = await prisma.user.create({
      data: {
        email: `payout-seller-${suffix}@example.test`,
        passwordHash: 'x',
        role: 'SELLER',
      },
    });
    const admin = await prisma.user.create({
      data: {
        email: `payout-admin-${suffix}@example.test`,
        passwordHash: 'x',
        role: 'ADMIN',
      },
    });
    ownerUserId = owner.id;
    adminUserId = admin.id;
    const seller = await prisma.seller.create({
      data: {
        ownerUserId,
        businessName: `Payout Seller ${suffix}`,
        registrationNumber: `PAYOUT-${suffix}`,
        country: 'ZM',
        businessAddress: '1 Test Street',
        contactEmail: `payout-${suffix}@example.test`,
        status: 'APPROVED',
      },
    });
    sellerId = seller.id;
    await prisma.sellerBalance.create({
      data: { sellerId, balance: 100, currency: 'ZMW' },
    });
    const account = await service.createAccount(ownerUserId, {
      method: PayoutAccountMethod.MOBILE_MONEY,
      provider: 'Airtel Money',
      accountHolderName: 'Test Seller',
      destination: { phoneNumber: '+260971234567' },
    });
    const verified = await service.verifyAccount(
      account.id,
      {
        status: PayoutAccountStatus.VERIFIED,
        note: 'Test verification',
        version: account.version,
      },
      adminUserId,
    );
    payoutAccountId = verified.id;
  });

  afterAll(async () => {
    if (!sellerId) {
      await prisma.$disconnect();
      return;
    }
    const batches = await prisma.payoutBatch.findMany({
      where: { requests: { some: { sellerId } } },
      select: { id: true },
    });
    await prisma.payoutRequestEvent.deleteMany({
      where: { payoutRequestId: { in: requestIds } },
    });
    await prisma.payoutAttempt.deleteMany({
      where: { payoutRequestId: { in: requestIds } },
    });
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
    await prisma.seller.delete({ where: { id: sellerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, adminUserId] } },
    });
    await prisma.$disconnect();
  });

  it('masks account destinations and never returns raw payout details', async () => {
    const [account] = await service.listOwnAccounts(ownerUserId);
    expect(account).toMatchObject({
      id: payoutAccountId,
      maskedReference: expect.stringMatching(/4567$/),
      status: PayoutAccountStatus.VERIFIED,
    });
    expect(account).not.toHaveProperty('destination');
  });

  it('reserves funds atomically and prevents concurrent overdraw', async () => {
    const attempts = await Promise.allSettled([
      service.createRequest(
        ownerUserId,
        { payoutAccountId, amount: 80 },
        randomUUID(),
      ),
      service.createRequest(
        ownerUserId,
        { payoutAccountId, amount: 80 },
        randomUUID(),
      ),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === 'rejected'),
    ).toHaveLength(1);
    const request = attempts.find(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.createRequest>>
      > => attempt.status === 'fulfilled',
    )!.value;
    requestIds.push(request.id);
    const balance = await ledger.getBalance(sellerId);
    expect(balance).toMatchObject({
      availableBalance: 20,
      pendingPayoutBalance: 80,
      paidBalance: 0,
    });
  });

  it('keeps an ambiguous manual transfer reserved until reconciliation succeeds', async () => {
    const [request] = (
      await service.listOwnRequests(ownerUserId, {
        page: 1,
        limit: 20,
      })
    ).items;
    expect(request).toBeDefined();
    await service.approve(
      request!.id,
      { version: request!.version },
      adminUserId,
      randomUUID(),
    );
    providerResults.push({
      outcome: 'RECONCILIATION_REQUIRED',
      providerReference: 'manual-transfer-1',
    });
    await service.processRequest(request!.id);
    const reconciling = await service.findAdminRequest(request!.id);
    expect(reconciling.status).toBe(SellerPayoutStatus.RECONCILIATION_REQUIRED);
    expect((await ledger.getBalance(sellerId)).pendingPayoutBalance).toBe(80);

    await service.resolve(
      request!.id,
      {
        outcome: PayoutResolutionOutcome.SUCCEEDED,
        providerReference: 'bank-confirmation-1',
        note: 'Confirmed against bank statement',
        version: reconciling.version,
      },
      adminUserId,
      randomUUID(),
    );
    const completed = await service.findAdminRequest(request!.id);
    expect(completed.status).toBe(SellerPayoutStatus.SUCCEEDED);
    expect(await ledger.getBalance(sellerId)).toMatchObject({
      availableBalance: 20,
      pendingPayoutBalance: 0,
      paidBalance: 80,
    });
    expect(
      await prisma.payout.count({ where: { payoutRequestId: request!.id } }),
    ).toBe(1);
    expect(
      await prisma.ledgerEntry.count({
        where: { referenceType: 'payout_request', referenceId: request!.id },
      }),
    ).toBe(1);
  });

  it('retains failed attempts and retries with a new append-only attempt', async () => {
    const created = await service.createRequest(
      ownerUserId,
      { payoutAccountId, amount: 20 },
      randomUUID(),
    );
    requestIds.push(created.id);
    await service.approve(
      created.id,
      { version: created.version },
      adminUserId,
      randomUUID(),
    );
    providerResults.push({
      outcome: 'FAILED',
      failureReason: 'Provider unavailable',
    });
    await service.processRequest(created.id);
    const failed = await service.findAdminRequest(created.id);
    expect(failed.status).toBe(SellerPayoutStatus.FAILED);
    expect(failed.attempts).toHaveLength(1);
    expect(failed.attempts[0]!.failureReason).toBe('Provider unavailable');

    await service.retry(
      created.id,
      { version: failed.version, reason: 'Provider recovered' },
      adminUserId,
      randomUUID(),
    );
    providerResults.push({
      outcome: 'SUCCEEDED',
      providerReference: 'provider-2',
    });
    await service.processRequest(created.id);
    const succeeded = await service.findAdminRequest(created.id);
    expect(succeeded.status).toBe(SellerPayoutStatus.SUCCEEDED);
    expect(succeeded.attempts).toHaveLength(2);
    expect(succeeded.attempts.map((attempt) => attempt.status)).toEqual([
      'FAILED',
      'SUCCEEDED',
    ]);
  });

  it('releases matured held proceeds exactly once under concurrent workers', async () => {
    const entry = await prisma.ledgerEntry.create({
      data: {
        sellerId,
        type: 'SALE',
        referenceType: 'hold-test',
        referenceId: randomUUID(),
        grossAmount: 30,
        commissionAmount: 0,
        netAmount: 30,
        currency: 'ZMW',
        availableAt: new Date(Date.now() - 1_000),
      },
    });
    await prisma.sellerBalance.update({
      where: { sellerId },
      data: { heldBalance: { increment: 30 } },
    });
    const released = await Promise.all([
      ledger.releaseMaturedFunds(),
      ledger.releaseMaturedFunds(),
    ]);
    expect(released.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(await ledger.getBalance(sellerId)).toMatchObject({
      availableBalance: 30,
      heldBalance: 0,
      pendingPayoutBalance: 0,
      paidBalance: 100,
    });
    expect(
      await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entry.id } }),
    ).toMatchObject({ releasedAt: expect.any(Date) });
  });

  it('moves stale in-flight transfers to reconciliation instead of retrying them', async () => {
    const created = await service.createRequest(
      ownerUserId,
      { payoutAccountId, amount: 10 },
      randomUUID(),
    );
    requestIds.push(created.id);
    const approved = await service.approve(
      created.id,
      { version: created.version },
      adminUserId,
      randomUUID(),
    );
    const staleAt = new Date(Date.now() - 60 * 60 * 1_000);
    await prisma.sellerPayoutRequest.update({
      where: { id: created.id },
      data: { status: 'PROCESSING', updatedAt: staleAt },
    });
    await prisma.payoutAttempt.create({
      data: {
        payoutRequestId: created.id,
        attemptNumber: 1,
        provider: 'crashed-provider',
        status: 'PROCESSING',
      },
    });

    expect(await service.recoverStaleProcessing(new Date())).toBe(1);
    const recovered = await service.findAdminRequest(created.id);
    expect(recovered).toMatchObject({
      status: SellerPayoutStatus.RECONCILIATION_REQUIRED,
      version: approved.version + 1,
    });
    expect(recovered.attempts[0]!.status).toBe('RECONCILIATION_REQUIRED');
  });

  async function approvedRequest(): Promise<
    Awaited<ReturnType<PayoutsService['approve']>>
  > {
    await prisma.sellerBalance.update({
      where: { sellerId },
      data: { balance: { increment: 10 } },
    });
    const request = await service.createRequest(
      ownerUserId,
      { payoutAccountId, amount: 10 },
      randomUUID(),
    );
    requestIds.push(request.id);
    return service.approve(
      request.id,
      { version: request.version },
      adminUserId,
      randomUUID(),
    );
  }

  it('does not retry a provider exception with an unknown transfer outcome', async () => {
    const request = await approvedRequest();
    // An empty queue throws, modeling a transport failure with no definitive result.
    await service.processRequest(request.id);
    const unknown = await service.findAdminRequest(request.id);
    expect(unknown.status).toBe('RECONCILIATION_REQUIRED');
    await expect(
      service.retry(
        request.id,
        { version: unknown.version },
        adminUserId,
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect(
      await prisma.payout.count({ where: { payoutRequestId: request.id } }),
    ).toBe(0);
  });

  it('rolls back accounting and requires reconciliation if saving success fails', async () => {
    const request = await approvedRequest();
    const before = await ledger.getBalance(sellerId);
    providerResults.push({
      outcome: 'SUCCEEDED',
      providerReference: 'x'.repeat(201),
    });
    await service.processRequest(request.id);
    expect((await service.findAdminRequest(request.id)).status).toBe(
      'RECONCILIATION_REQUIRED',
    );
    expect(await ledger.getBalance(sellerId)).toEqual(before);
    expect(
      await prisma.payout.count({ where: { payoutRequestId: request.id } }),
    ).toBe(0);
  });

  it('allows only one of two conflicting reconciliation decisions', async () => {
    const request = await approvedRequest();
    providerResults.push({ outcome: 'RECONCILIATION_REQUIRED' });
    await service.processRequest(request.id);
    const current = await service.findAdminRequest(request.id);
    const results = await Promise.allSettled([
      service.resolve(
        request.id,
        {
          version: current.version,
          outcome: PayoutResolutionOutcome.SUCCEEDED,
          providerReference: 'race-paid',
        },
        adminUserId,
        randomUUID(),
      ),
      service.resolve(
        request.id,
        {
          version: current.version,
          outcome: PayoutResolutionOutcome.FAILED,
          providerReference: 'race-failed',
        },
        adminUserId,
        randomUUID(),
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const final = await service.findAdminRequest(request.id);
    expect(final.attempts[0]!.status).toBe(final.status);
    expect(
      await prisma.payout.count({ where: { payoutRequestId: request.id } }),
    ).toBe(final.status === 'SUCCEEDED' ? 1 : 0);
  });

  it('replays concurrent identical reconciliation without duplicate accounting', async () => {
    const request = await approvedRequest();
    providerResults.push({ outcome: 'RECONCILIATION_REQUIRED' });
    await service.processRequest(request.id);
    const current = await service.findAdminRequest(request.id);
    const input = {
      version: current.version,
      outcome: PayoutResolutionOutcome.SUCCEEDED,
      providerReference: 'idempotent-paid',
    };
    const key = randomUUID();
    await Promise.all([
      service.resolve(request.id, input, adminUserId, key),
      service.resolve(request.id, input, adminUserId, key),
    ]);
    expect(
      await prisma.payout.count({ where: { payoutRequestId: request.id } }),
    ).toBe(1);
  });

  it('claims accurate batches concurrently and resumes assigned requests after a crash', async () => {
    const requests = [await approvedRequest(), await approvedRequest()];
    const batches = (
      await Promise.all([service.createBatch(1), service.createBatch(1)])
    ).filter((id): id is string => id !== null);
    expect(batches).toHaveLength(2);
    for (const id of batches) {
      const batch = await service.findBatch(id);
      expect(batch.requestCount).toBe(batch.requests.length);
      expect(batch.totalAmount).toBe(
        batch.requests.reduce((sum, row) => sum + row.amount, 0),
      );
    }
    // A new worker sees the assigned requests even though createBatch cannot claim them again.
    expect(await service.createBatch()).toBeNull();
    providerResults.push(
      { outcome: 'SUCCEEDED', providerReference: 'resume-1' },
      { outcome: 'SUCCEEDED', providerReference: 'resume-2' },
    );
    await Promise.all([service.resumeBatches(), service.resumeBatches()]);
    for (const request of requests) {
      expect((await service.findAdminRequest(request.id)).status).toBe(
        'SUCCEEDED',
      );
      expect(
        await prisma.payout.count({ where: { payoutRequestId: request.id } }),
      ).toBe(1);
    }
  });
});
