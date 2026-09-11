import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LedgerEntryType,
  type LedgerEntry,
  type Payout,
  type SellerOrder,
} from '@prisma/client';

import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';

export type LedgerPage<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export type SellerBalanceView = {
  sellerId: string;
  balance: number;
  currency: string;
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // No-op for the platform's own first-party seller orders (sellerId: null)
  // - that revenue is already the platform's, not commission-split.
  async recordSale(sellerOrder: SellerOrder): Promise<void> {
    if (!sellerOrder.sellerId) {
      return;
    }

    const commissionAmount = this.applyBps(sellerOrder.total);
    const netAmount = sellerOrder.total - commissionAmount;

    await this.appendEntry({
      sellerId: sellerOrder.sellerId,
      type: LedgerEntryType.SALE,
      referenceType: 'seller_order',
      referenceId: sellerOrder.id,
      grossAmount: sellerOrder.total,
      commissionAmount,
      netAmount,
      currency: sellerOrder.currency,
      description: `Sale for seller order ${sellerOrder.id}`,
    });
  }

  async recordRefundReversal(
    sellerOrder: SellerOrder,
    refundAmount: number,
  ): Promise<void> {
    if (!sellerOrder.sellerId) {
      return;
    }

    const commissionReversal = this.applyBps(refundAmount);
    const netReversal = refundAmount - commissionReversal;

    await this.appendEntry({
      sellerId: sellerOrder.sellerId,
      type: LedgerEntryType.REFUND,
      referenceType: 'seller_order',
      referenceId: sellerOrder.id,
      grossAmount: -refundAmount,
      commissionAmount: -commissionReversal,
      netAmount: -netReversal,
      currency: sellerOrder.currency,
      description: `Refund reversal for seller order ${sellerOrder.id}`,
    });
  }

  async recordPayout(
    sellerId: string,
    amount: number,
    reference?: string,
    note?: string,
  ): Promise<Payout> {
    const currentBalance = await this.getBalance(sellerId);

    if (amount > currentBalance.balance) {
      throw new ConflictException('Payout amount exceeds the seller balance');
    }

    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.payout.create({
        data: {
          sellerId,
          amount,
          currency: currentBalance.currency,
          reference,
          note,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          sellerId,
          type: LedgerEntryType.PAYOUT,
          referenceType: 'payout',
          referenceId: payout.id,
          grossAmount: -amount,
          commissionAmount: 0,
          netAmount: -amount,
          currency: currentBalance.currency,
          description: `Payout ${payout.id}`,
        },
      });

      await tx.sellerBalance.update({
        where: { sellerId },
        data: { balance: { decrement: amount } },
      });

      return payout;
    });
  }

  async getBalance(sellerId: string): Promise<SellerBalanceView> {
    const balance = await this.prisma.sellerBalance.findUnique({
      where: { sellerId },
    });

    return balance
      ? {
          sellerId: balance.sellerId,
          balance: balance.balance,
          currency: balance.currency,
        }
      : { sellerId, balance: 0, currency: 'USD' };
  }

  async listEntries(
    sellerId: string,
    query: PaginationQueryDto,
  ): Promise<LedgerPage<LedgerEntry>> {
    const where = { sellerId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async listPayouts(query: PaginationQueryDto): Promise<LedgerPage<Payout>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.payout.count(),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  private applyBps(amount: number): number {
    const bps = this.config.get<number>('MARKETPLACE_COMMISSION_BPS', 1000);
    return Math.round((amount * bps) / 10000);
  }

  private async appendEntry(data: {
    sellerId: string;
    type: LedgerEntryType;
    referenceType: string;
    referenceId: string;
    grossAmount: number;
    commissionAmount: number;
    netAmount: number;
    currency: string;
    description: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.create({ data });

      await tx.sellerBalance.upsert({
        where: { sellerId: data.sellerId },
        create: {
          sellerId: data.sellerId,
          balance: data.netAmount,
          currency: data.currency,
        },
        update: { balance: { increment: data.netAmount } },
      });
    });
  }
}
