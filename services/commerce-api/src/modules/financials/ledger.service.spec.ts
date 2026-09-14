import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import type { Prisma, SellerOrder } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from './ledger.service';

function buildPrisma(): {
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  ledgerEntry: Record<'create' | 'findMany' | 'findFirst', jest.Mock>;
  sellerBalance: Record<
    'findUnique' | 'findUniqueOrThrow' | 'upsert' | 'update' | 'updateMany',
    jest.Mock
  >;
  payout: { create: jest.Mock };
} {
  const p = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    ledgerEntry: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    sellerBalance: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: 'USD' }),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payout: { create: jest.fn().mockResolvedValue({ id: 'payout-1' }) },
  };
  p.$transaction.mockImplementation((fn: (tx: typeof p) => unknown) => fn(p));
  return p;
}
describe('LedgerService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let config: ConfigService;
  let service: LedgerService;
  const order = {
    id: 'so-1',
    sellerId: 'seller-1',
    currency: 'USD',
    total: 10,
    refundedAmount: 0,
  } as SellerOrder;
  beforeEach(() => {
    prisma = buildPrisma();
    config = new ConfigService({ MARKETPLACE_COMMISSION_BPS: 1000 });
    service = new LedgerService(prisma as unknown as PrismaService, config);
  });
  it('does not book seller revenue for platform sales', async () => {
    await service.recordSale({ ...order, sellerId: null });
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
  });
  it('records commission and credits the net sale', async () => {
    await service.recordSale(order);
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        grossAmount: 10,
        commissionAmount: 1,
        netAmount: 9,
      }) as object,
    });
    expect(prisma.sellerBalance.update).toHaveBeenCalledWith({
      where: { sellerId: 'seller-1' },
      data: { balance: { increment: 9 } },
    });
  });
  it('does not credit the same sale twice', async () => {
    prisma.ledgerEntry.findFirst.mockResolvedValue({
      grossAmount: 10,
      netAmount: 9,
      currency: 'USD',
    });
    await service.recordSale(order);
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(prisma.sellerBalance.update).not.toHaveBeenCalled();
  });
  it('rejects mixed settlement currencies', async () => {
    prisma.sellerBalance.findUniqueOrThrow.mockResolvedValue({
      currency: 'ZMW',
    });
    await expect(service.recordSale(order)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
  });
  it('fully reverses original commission across partial refunds despite changed settings', async () => {
    config.set('MARKETPLACE_COMMISSION_BPS', 5000);
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { grossAmount: 10, commissionAmount: 1, netAmount: 9, currency: 'USD' },
    ]);
    await service.recordRefundReversal(order, 5, 'refund-1');
    await service.recordRefundReversal(
      { ...order, refundedAmount: 5 },
      5,
      'refund-2',
    );
    const entries = prisma.ledgerEntry.create.mock.calls.map(
      ([args]: [{ data: Prisma.LedgerEntryUncheckedCreateInput }]) => args.data,
    );
    expect(entries.map((e) => e.commissionAmount)).toEqual([-1, 0]);
    expect(entries.reduce((sum, e) => sum + e.netAmount, 0)).toBe(-9);
  });
  it('rejects refunds without exactly one original sale ledger entry', async () => {
    prisma.ledgerEntry.findMany.mockResolvedValue([]);
    await expect(
      service.recordRefundReversal(order, 5, 'refund-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects payouts exceeding a locked balance', async () => {
    prisma.sellerBalance.findUnique.mockResolvedValue({
      balance: 100,
      currency: 'ZMW',
    });
    await expect(service.recordPayout('seller-1', 200)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });
  it('checks the conditional debit before recording a payout', async () => {
    prisma.sellerBalance.findUnique.mockResolvedValue({
      balance: 100,
      currency: 'ZMW',
    });
    prisma.sellerBalance.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.recordPayout('seller-1', 80)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });
  it('records a payout and guarded debit in one transaction', async () => {
    prisma.sellerBalance.findUnique.mockResolvedValue({
      balance: 100,
      currency: 'ZMW',
    });
    await service.recordPayout('seller-1', 80);
    expect(prisma.sellerBalance.updateMany).toHaveBeenCalledWith({
      where: { sellerId: 'seller-1', balance: { gte: 80 } },
      data: { balance: { decrement: 80 } },
    });
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        netAmount: -80,
        type: 'PAYOUT',
      }) as object,
    });
  });
});
