import { ConfigService } from '@nestjs/config';
import { PayoutAttemptStatus, SellerPayoutStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SellersService } from '../../sellers/sellers.service';
import { LedgerService } from '../ledger.service';
import { PayoutResolutionOutcome } from '../dto/payout-request.dto';
import { PayoutsService } from './payouts.service';
import type { PayoutProviderResult } from './payout-provider';

// Inferred fixture type preserves the individual Jest mock signatures.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function harness() {
  const row = {
    id: 'request',
    sellerId: 'seller',
    payoutAccountId: 'account',
    amount: 20,
    currency: 'ZMW',
    version: 1,
    status: SellerPayoutStatus.APPROVED as SellerPayoutStatus,
    destinationSnapshot: { phoneNumber: '12345678' },
  };
  const attempt = {
    id: 'attempt',
    status: PayoutAttemptStatus.PROCESSING as PayoutAttemptStatus,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    seller: { findUnique: jest.fn().mockResolvedValue({ status: 'APPROVED' }) },
    sellerPayoutAccount: {
      findUnique: jest.fn().mockResolvedValue({
        sellerId: 'seller',
        status: 'VERIFIED',
        destination: row.destinationSnapshot,
      }),
    },
    sellerPayoutRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...row })),
      findUniqueOrThrow: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...row })),
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...row })),
      update: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: { status: SellerPayoutStatus } }) => {
            row.status = data.status;
            row.version += 1;
            return Promise.resolve({ ...row });
          },
        ),
    },
    payoutAttempt: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ ...attempt }),
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ ...attempt })),
      update: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: { status: PayoutAttemptStatus } }) => {
            attempt.status = data.status;
            return Promise.resolve({ ...attempt });
          },
        ),
    },
    payoutRequestEvent: {
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    sellerBalance: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    payout: { create: jest.fn().mockResolvedValue({ id: 'payout' }) },
    payoutBatch: { update: jest.fn() },
    ledgerEntry: { create: jest.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const provider = {
    name: 'test',
    submit: jest.fn<Promise<PayoutProviderResult>, [unknown]>(),
  };
  const service = new PayoutsService(
    prisma as unknown as PrismaService,
    new ConfigService(),
    {} as SellersService,
    {} as LedgerService,
    {} as AuditService,
    provider,
  );
  return { service, provider, tx, row, attempt };
}

describe('payout outcome safety', () => {
  it('does not close a batch while another worker has an in-flight request', async () => {
    const { service, tx } = harness();
    await service.processBatch('batch');
    expect(tx.payoutBatch.update).not.toHaveBeenCalled();
  });
  it('routes a transport exception to reconciliation without moving reserved funds', async () => {
    const { service, provider, row, tx } = harness();
    provider.submit.mockRejectedValue(
      new Error('timeout with sensitive provider details'),
    );
    await service.processRequest(row.id);
    expect(row.status).toBe('RECONCILIATION_REQUIRED');
    expect(tx.sellerBalance.updateMany).not.toHaveBeenCalled();
    expect(
      JSON.stringify(tx.payoutRequestEvent.create.mock.calls),
    ).not.toContain('sensitive');
    expect(provider.submit).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'attempt' }),
    );
  });
  it('keeps a definitive provider rejection as a failed attempt', async () => {
    const { service, provider, row, attempt } = harness();
    provider.submit.mockResolvedValue({
      outcome: 'FAILED',
      failureReason: 'Transfer rejected',
    });
    await service.processRequest(row.id);
    expect(row.status).toBe('FAILED');
    expect(attempt.status).toBe('FAILED');
  });
  it('does not classify a success-persistence error as a retryable failure', async () => {
    const { service, provider, row, tx } = harness();
    provider.submit.mockResolvedValue({
      outcome: 'SUCCEEDED',
      providerReference: 'paid',
    });
    tx.payout.create.mockRejectedValue(new Error('database unavailable'));
    await service.processRequest(row.id);
    expect(row.status).toBe('RECONCILIATION_REQUIRED');
  });
  it('does not submit a payout for a suspended seller', async () => {
    const { service, provider, row, tx } = harness();
    tx.seller.findUnique.mockResolvedValue({ status: 'SUSPENDED' });
    await service.processRequest(row.id);
    expect(provider.submit).not.toHaveBeenCalled();
    expect(row.status).toBe('RECONCILIATION_REQUIRED');
  });
  it('does not submit to an edited or unverified destination', async () => {
    const { service, provider, row, tx } = harness();
    tx.sellerPayoutAccount.findUnique.mockResolvedValue({
      sellerId: 'seller',
      status: 'PENDING_VERIFICATION',
      destination: { phoneNumber: 'other' },
    });
    await service.processRequest(row.id);
    expect(provider.submit).not.toHaveBeenCalled();
    expect(row.status).toBe('RECONCILIATION_REQUIRED');
  });
  it('rechecks reconciliation version inside the transaction', async () => {
    const { service, row, tx, attempt } = harness();
    row.status = SellerPayoutStatus.RECONCILIATION_REQUIRED;
    attempt.status = PayoutAttemptStatus.RECONCILIATION_REQUIRED;
    tx.sellerPayoutRequest.findUniqueOrThrow.mockResolvedValue({
      ...row,
      version: row.version + 1,
    });
    await expect(
      service.resolve(
        row.id,
        {
          version: row.version,
          outcome: PayoutResolutionOutcome.FAILED,
          providerReference: 'rejected',
        },
        'admin',
        'key',
      ),
    ).rejects.toThrow('Payout changed');
    expect(tx.payoutAttempt.update).not.toHaveBeenCalled();
  });
});
