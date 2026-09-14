import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LedgerEntryType,
  type LedgerEntry,
  type Payout,
  type SellerOrder,
  type Prisma,
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

  // Settlement currency is fixed per seller; checkout claims it before charging.
  async ensureCurrency(
    sellerId: string,
    currency: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.sellerBalance.upsert({
      where: { sellerId },
      create: { sellerId, balance: 0, currency },
      update: {},
    });
    await tx.$queryRaw`SELECT seller_id FROM seller_balances WHERE seller_id = ${sellerId}::uuid FOR UPDATE`;
    const balance = await tx.sellerBalance.findUniqueOrThrow({
      where: { sellerId },
    });
    if (balance.currency !== currency)
      throw new ConflictException(
        'Seller settlement currency does not match this transaction',
      );
  }

  async recordSale(
    sellerOrder: SellerOrder,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!sellerOrder.sellerId) return;
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.recordSale(sellerOrder, client),
      );
    const commissionAmount = this.applyBps(sellerOrder.total);
    await this.appendEntry(
      {
        sellerId: sellerOrder.sellerId,
        type: LedgerEntryType.SALE,
        referenceType: 'seller_order',
        referenceId: sellerOrder.id,
        grossAmount: sellerOrder.total,
        commissionAmount,
        netAmount: sellerOrder.total - commissionAmount,
        currency: sellerOrder.currency,
        description: `Sale for seller order ${sellerOrder.id}`,
      },
      tx,
    );
  }

  async recordRefundReversal(
    sellerOrder: SellerOrder,
    refundAmount: number,
    refundId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!sellerOrder.sellerId) return;
    if (!tx)
      return this.prisma.$transaction((client) =>
        this.recordRefundReversal(sellerOrder, refundAmount, refundId, client),
      );
    await this.ensureCurrency(sellerOrder.sellerId, sellerOrder.currency, tx);
    const sales = await tx.ledgerEntry.findMany({
      where: {
        sellerId: sellerOrder.sellerId,
        type: LedgerEntryType.SALE,
        referenceType: 'seller_order',
        referenceId: sellerOrder.id,
      },
    });
    const sale = sales[0];
    if (
      !sale ||
      sales.length !== 1 ||
      sale.grossAmount !== sellerOrder.total ||
      sale.currency !== sellerOrder.currency
    )
      throw new ConflictException(
        'Original sale ledger requires reconciliation',
      );
    const cumulative = sellerOrder.refundedAmount + refundAmount;
    if (
      refundAmount <= 0 ||
      cumulative > sellerOrder.total ||
      sellerOrder.total <= 0
    )
      throw new ConflictException('Invalid cumulative refund');
    // Use the original sale commission, with cumulative rounding so a full
    // refund exactly reverses the sale even across many partial refunds.
    const proportion = (amount: number): number =>
      Number(
        (BigInt(sale.commissionAmount) * BigInt(amount) +
          BigInt(Math.floor(sellerOrder.total / 2))) /
          BigInt(sellerOrder.total),
      );
    const commissionAmount =
      proportion(cumulative) - proportion(sellerOrder.refundedAmount);
    await this.appendEntry(
      {
        sellerId: sellerOrder.sellerId,
        type: LedgerEntryType.REFUND,
        referenceType: 'refund',
        referenceId: refundId,
        grossAmount: -refundAmount,
        commissionAmount: commissionAmount === 0 ? 0 : -commissionAmount,
        netAmount: -(refundAmount - commissionAmount),
        currency: sellerOrder.currency,
        description: `Refund ${refundId} for seller order ${sellerOrder.id}`,
      },
      tx,
    );
  }

  async recordPayout(
    sellerId: string,
    amount: number,
    reference?: string,
    note?: string,
  ): Promise<Payout> {
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new ConflictException('Payout amount must be positive minor units');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT seller_id FROM seller_balances WHERE seller_id = ${sellerId}::uuid FOR UPDATE`;
      const balance = await tx.sellerBalance.findUnique({
        where: { sellerId },
      });
      if (!balance || amount > balance.balance)
        throw new ConflictException('Payout amount exceeds the seller balance');
      if (balance.currency !== 'ZMW')
        throw new ConflictException('Payouts require a ZMW seller account');
      const changed = await tx.sellerBalance.updateMany({
        where: { sellerId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (changed.count !== 1)
        throw new ConflictException('Payout amount exceeds the seller balance');
      const payout = await tx.payout.create({
        data: { sellerId, amount, currency: balance.currency, reference, note },
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
          currency: balance.currency,
          description: `Payout ${payout.id}`,
        },
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
      : { sellerId, balance: 0, currency: 'ZMW' };
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

  private async appendEntry(
    data: Prisma.LedgerEntryUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.ensureCurrency(data.sellerId, data.currency, tx);
    const existing = await tx.ledgerEntry.findFirst({
      where: {
        sellerId: data.sellerId,
        type: data.type,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
      },
    });
    if (existing) {
      if (
        existing.grossAmount !== data.grossAmount ||
        existing.netAmount !== data.netAmount ||
        existing.currency !== data.currency
      )
        throw new ConflictException(
          'Ledger reference already has different amounts',
        );
      return;
    }
    await tx.ledgerEntry.create({ data });
    await tx.sellerBalance.update({
      where: { sellerId: data.sellerId },
      data: { balance: { increment: data.netAmount } },
    });
  }
}
