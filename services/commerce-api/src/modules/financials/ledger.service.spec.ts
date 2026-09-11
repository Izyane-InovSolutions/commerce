import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from './ledger.service';

function buildPrisma(): {
  ledgerEntry: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  sellerBalance: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
  };
  payout: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
} {
  const prisma = {
    ledgerEntry: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    sellerBalance: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    payout: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
  return prisma;
}

describe('LedgerService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: LedgerService;

  beforeEach(() => {
    prisma = buildPrisma();
    const config = new ConfigService({ MARKETPLACE_COMMISSION_BPS: 1000 });
    service = new LedgerService(prisma as unknown as PrismaService, config);
  });

  describe('recordSale', () => {
    it('is a no-op for the platform group (sellerId: null)', async () => {
      await service.recordSale({
        id: 'so-1',
        sellerId: null,
        total: 1000,
        currency: 'USD',
      } as never);

      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
      expect(prisma.sellerBalance.upsert).not.toHaveBeenCalled();
    });

    it('computes a 10% commission and credits the seller with the net amount', async () => {
      await service.recordSale({
        id: 'so-1',
        sellerId: 'seller-1',
        total: 1000,
        currency: 'USD',
      } as never);

      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sellerId: 'seller-1',
          type: 'SALE',
          grossAmount: 1000,
          commissionAmount: 100,
          netAmount: 900,
        }) as object,
      });
      expect(prisma.sellerBalance.upsert).toHaveBeenCalledWith({
        where: { sellerId: 'seller-1' },
        create: { sellerId: 'seller-1', balance: 900, currency: 'USD' },
        update: { balance: { increment: 900 } },
      });
    });
  });

  describe('recordRefundReversal', () => {
    it('is a no-op for the platform group', async () => {
      await service.recordRefundReversal(
        { id: 'so-1', sellerId: null, currency: 'USD' } as never,
        500,
      );

      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it('creates a negative reversal entry and decrements the balance', async () => {
      await service.recordRefundReversal(
        { id: 'so-1', sellerId: 'seller-1', currency: 'USD' } as never,
        500,
      );

      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sellerId: 'seller-1',
          type: 'REFUND',
          grossAmount: -500,
          commissionAmount: -50,
          netAmount: -450,
        }) as object,
      });
      expect(prisma.sellerBalance.upsert).toHaveBeenCalledWith({
        where: { sellerId: 'seller-1' },
        create: { sellerId: 'seller-1', balance: -450, currency: 'USD' },
        update: { balance: { increment: -450 } },
      });
    });
  });

  describe('recordPayout', () => {
    it('rejects a payout exceeding the current balance', async () => {
      prisma.sellerBalance.findUnique.mockResolvedValue({
        sellerId: 'seller-1',
        balance: 100,
        currency: 'USD',
      });

      await expect(
        service.recordPayout('seller-1', 200),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payout.create).not.toHaveBeenCalled();
    });

    it('creates the payout, a debiting ledger entry, and decrements the balance', async () => {
      prisma.sellerBalance.findUnique.mockResolvedValue({
        sellerId: 'seller-1',
        balance: 500,
        currency: 'USD',
      });
      prisma.payout.create.mockResolvedValue({
        id: 'payout-1',
        sellerId: 'seller-1',
        amount: 300,
      });

      const payout = await service.recordPayout(
        'seller-1',
        300,
        'ref-1',
        'note',
      );

      expect(payout.id).toBe('payout-1');
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sellerId: 'seller-1',
          type: 'PAYOUT',
          referenceId: 'payout-1',
          netAmount: -300,
        }) as object,
      });
      expect(prisma.sellerBalance.update).toHaveBeenCalledWith({
        where: { sellerId: 'seller-1' },
        data: { balance: { decrement: 300 } },
      });
    });
  });
});
