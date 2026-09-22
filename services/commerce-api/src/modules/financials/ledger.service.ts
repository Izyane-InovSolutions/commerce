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
  /** @deprecated `balance` remains as an alias for availableBalance. */
  balance: number;
  availableBalance: number;
  heldBalance: number;
  pendingPayoutBalance: number;
  paidBalance: number;
  currency: string;
};

export type SellerBalanceIntegrity = {
  sellerId: string;
  currency: string | null;
  actual: { available: number; held: number; pending: number; paid: number };
  expected: { available: number; held: number; pending: number; paid: number };
  discrepancies: string[];
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Read-only, consistent snapshot. Never repairs balances or releases holds. */
  async checkIntegrity(sellerId: string): Promise<SellerBalanceIntegrity> {
    return this.prisma.$transaction(
      async (tx) => {
        const balance = await tx.sellerBalance.findUnique({
          where: { sellerId },
        });
        const ledger = await tx.ledgerEntry.aggregate({
          where: { sellerId },
          _sum: { netAmount: true },
        });
        const held = await tx.ledgerEntry.aggregate({
          where: { sellerId, type: LedgerEntryType.SALE, releasedAt: null },
          _sum: { netAmount: true },
        });
        const pending = await tx.sellerPayoutRequest.aggregate({
          where: { sellerId, status: { notIn: ['SUCCEEDED', 'CANCELLED'] } },
          _sum: { amount: true },
        });
        const paid = await tx.payout.aggregate({
          where: { sellerId },
          _sum: { amount: true },
        });
        const expected = {
          available:
            (ledger._sum.netAmount ?? 0) -
            (held._sum.netAmount ?? 0) -
            (pending._sum.amount ?? 0),
          held: held._sum.netAmount ?? 0,
          pending: pending._sum.amount ?? 0,
          paid: paid._sum.amount ?? 0,
        };
        const actual = {
          available: balance?.balance ?? 0,
          held: balance?.heldBalance ?? 0,
          pending: balance?.pendingPayoutBalance ?? 0,
          paid: balance?.paidBalance ?? 0,
        };
        const discrepancies: string[] = (
          Object.keys(expected) as Array<keyof typeof expected>
        ).filter((key) => expected[key] !== actual[key]);
        if (!balance) discrepancies.push('missing_balance');
        if (balance) {
          const mismatched = await tx.ledgerEntry.count({
            where: { sellerId, currency: { not: balance.currency } },
          });
          const mismatchedPayouts = await tx.payout.count({
            where: { sellerId, currency: { not: balance.currency } },
          });
          const mismatchedRequests = await tx.sellerPayoutRequest.count({
            where: { sellerId, currency: { not: balance.currency } },
          });
          if (mismatched || mismatchedPayouts || mismatchedRequests)
            discrepancies.push('mixed_currency');
        }
        return {
          sellerId,
          currency: balance?.currency ?? null,
          actual,
          expected,
          discrepancies,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

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
    const holdDays = this.config.get<number>('SELLER_PAYOUT_HOLD_DAYS', 0);
    const availableAt = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1_000);
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
        availableAt,
        ...(holdDays === 0 ? { releasedAt: new Date() } : {}),
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
    idempotencyKey: string,
    recordedByUserId: string,
    reference?: string,
    note?: string,
  ): Promise<Payout> {
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new ConflictException('Payout amount must be positive minor units');
    return this.prisma.$transaction(async (tx) => {
      // Locked first so a replay check and a concurrent fresh payout for the
      // same seller can never interleave — whichever request gets here first
      // decides the outcome for every request behind it.
      await tx.$queryRaw`SELECT seller_id FROM seller_balances WHERE seller_id = ${sellerId}::uuid FOR UPDATE`;

      const existing = await tx.payout.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        if (
          existing.sellerId !== sellerId ||
          existing.amount !== amount ||
          (existing.reference ?? null) !== (reference ?? null) ||
          (existing.note ?? null) !== (note ?? null)
        )
          throw new ConflictException(
            'Idempotency key already belongs to a different payout request',
          );
        return existing;
      }

      const balance = await tx.sellerBalance.findUnique({
        where: { sellerId },
      });
      if (!balance) throw new ConflictException('Seller has no balance record');
      if (balance.currency !== 'ZMW')
        throw new ConflictException('Payouts require a ZMW seller account');
      if (amount > balance.balance)
        throw new ConflictException('Payout amount exceeds the seller balance');
      const changed = await tx.sellerBalance.updateMany({
        where: { sellerId, balance: { gte: amount } },
        data: {
          balance: { decrement: amount },
          paidBalance: { increment: amount },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('Payout amount exceeds the seller balance');
      const payout = await tx.payout.create({
        data: {
          sellerId,
          amount,
          currency: balance.currency,
          reference,
          note,
          idempotencyKey,
          recordedByUserId,
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
          availableBalance: balance.balance,
          heldBalance: balance.heldBalance,
          pendingPayoutBalance: balance.pendingPayoutBalance,
          paidBalance: balance.paidBalance,
          currency: balance.currency,
        }
      : {
          sellerId,
          balance: 0,
          availableBalance: 0,
          heldBalance: 0,
          pendingPayoutBalance: 0,
          paidBalance: 0,
          currency: 'ZMW',
        };
  }

  /** Moves matured SALE proceeds from held to available exactly once. */
  async releaseMaturedFunds(limit = 100): Promise<number> {
    const candidates = await this.prisma.ledgerEntry.findMany({
      where: {
        type: LedgerEntryType.SALE,
        releasedAt: null,
        availableAt: { lte: new Date() },
      },
      orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    let released = 0;
    for (const entry of candidates) {
      const changed = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT seller_id FROM seller_balances WHERE seller_id = ${entry.sellerId}::uuid FOR UPDATE`;
        const marked = await tx.ledgerEntry.updateMany({
          where: { id: entry.id, releasedAt: null },
          data: { releasedAt: new Date() },
        });
        if (marked.count !== 1) return false;
        await tx.sellerBalance.update({
          where: { sellerId: entry.sellerId },
          data: {
            heldBalance: { decrement: entry.netAmount },
            balance: { increment: entry.netAmount },
          },
        });
        return true;
      });
      if (changed) released += 1;
    }
    return released;
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
        existing.commissionAmount !== data.commissionAmount ||
        existing.netAmount !== data.netAmount ||
        existing.currency !== data.currency
      )
        throw new ConflictException(
          'Ledger reference already has different amounts',
        );
      return;
    }
    await tx.ledgerEntry.create({ data });
    const isHeldSale =
      data.type === LedgerEntryType.SALE &&
      data.availableAt instanceof Date &&
      data.availableAt.getTime() > Date.now() &&
      !data.releasedAt;
    await tx.sellerBalance.update({
      where: { sellerId: data.sellerId },
      data: isHeldSale
        ? { heldBalance: { increment: data.netAmount } }
        : { balance: { increment: data.netAmount } },
    });
  }
}
