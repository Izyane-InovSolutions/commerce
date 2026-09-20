import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from './ledger.service';

describe('read-only seller balance integrity', () => {
  it('accounts for held and reserved money separately from lifetime payouts', async () => {
    const tx = {
      sellerBalance: {
        findUnique: jest.fn().mockResolvedValue({
          currency: 'ZMW',
          balance: 50,
          heldBalance: 20,
          pendingPayoutBalance: 30,
          paidBalance: 40,
        }),
      },
      ledgerEntry: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { netAmount: 100 } })
          .mockResolvedValueOnce({ _sum: { netAmount: 20 } }),
        count: jest.fn().mockResolvedValue(0),
      },
      sellerPayoutRequest: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 30 } }),
        count: jest.fn().mockResolvedValue(0),
      },
      payout: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 40 } }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const report = await new LedgerService(
      prisma as unknown as PrismaService,
      new ConfigService(),
    ).checkIntegrity('seller');
    expect(report.discrepancies).toEqual([]);
    expect(report.actual).toEqual(report.expected);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });
  it('reports missing projections and mismatches without issuing writes', async () => {
    const tx = {
      sellerBalance: { findUnique: jest.fn().mockResolvedValue(null) },
      ledgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { netAmount: null } }),
      },
      sellerPayoutRequest: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
      payout: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 40 } }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const report = await new LedgerService(
      prisma as unknown as PrismaService,
      new ConfigService(),
    ).checkIntegrity('seller');
    expect(report.discrepancies).toEqual(['paid', 'missing_balance']);
  });
});
