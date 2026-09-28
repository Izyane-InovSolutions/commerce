import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import {
  SalesAnalyticsQueryDto,
  SalesInterval,
} from './dto/sales-analytics-query.dto';
import {
  SalesAnalyticsDto,
  SalesCategoryShare,
  SalesSeriesPoint,
  SalesTopProduct,
  SalesTopSeller,
  SalesTotals,
} from './sales-analytics.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 30 * DAY_MS;
const MAX_RANGE_MS = 366 * DAY_MS;
const TOP_PRODUCT_LIMIT = 10;
const CATEGORY_LIMIT = 8;
const TOP_SELLER_LIMIT = 5;
/** What the storefront calls the platform's own offers. */
export const FIRST_PARTY_NAME = 'iZyane';

/**
 * Orders that collected money. A refund doesn't un-sell an order, so
 * (PARTIALLY_)REFUNDED still count toward gross sales — same set
 * OperationsMetricsService uses for its sales figures.
 */
export const PAID_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PARTIALLY_REFUNDED,
  OrderStatus.REFUNDED,
];

type SeriesRow = { periodStart: Date; orderCount: bigint; grossAmount: bigint };
type TotalsRow = { orderCount: bigint; grossAmount: bigint };
type CategoryRow = {
  categoryId: string | null;
  categoryName: string | null;
  unitsSold: bigint;
  grossAmount: bigint;
};
type SellerRow = {
  sellerId: string | null;
  sellerName: string | null;
  storefrontSlug: string | null;
  orderCount: bigint;
  grossAmount: bigint;
};

/** Narrows a report to one seller. A platform report is over whole orders
 * (items plus shipping); a seller's is over their own order lines, since an
 * order can span several sellers and its total isn't theirs. */
export type SalesScope = { sellerId: string };

function toTotals(orderCount: number, grossAmount: number): SalesTotals {
  return {
    orderCount,
    grossAmount,
    averageOrderAmount:
      orderCount > 0 ? Math.round(grossAmount / orderCount) : 0,
  };
}

type TopProductRow = {
  productId: string;
  productName: string;
  unitsSold: bigint;
  grossAmount: bigint;
};

/** UTC start of the bucket `date` falls in; weeks start on Monday, matching
 * Postgres' date_trunc('week'). */
export function truncateUtc(date: Date, interval: SalesInterval): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (interval === 'month') return new Date(Date.UTC(year, month, 1));
  if (interval === 'week') {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(year, month, day - mondayOffset));
  }
  return new Date(Date.UTC(year, month, day));
}

function nextPeriod(start: Date, interval: SalesInterval): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  if (interval === 'month') return new Date(Date.UTC(year, month + 1, 1));
  return new Date(Date.UTC(year, month, day + (interval === 'week' ? 7 : 1)));
}

/**
 * Timestamps are stored as UTC `timestamp without time zone`; converting the
 * bound value explicitly keeps the comparison independent of the database
 * session's TimeZone setting.
 */
function utcTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

@Injectable()
export class SalesAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Orders are bucketed by `Order.createdAt`: Order has no paid-at column,
   * and payment normally settles within the checkout session, so the order's
   * creation time is the "sale time" here — the same approximation
   * OperationsMetricsService makes, so both dashboards agree on a range.
   */
  async getSales(
    query: SalesAnalyticsQueryDto,
    scope?: SalesScope,
  ): Promise<SalesAnalyticsDto> {
    const interval = query.interval ?? 'day';
    const currency = query.currency;
    const { from, to } = this.resolveRange(query.from, query.to);
    const previousFrom = new Date(
      from.getTime() - (to.getTime() - from.getTime()),
    );

    const paidIn = (
      start: Date,
      end: Date,
      endInclusive: boolean,
    ): Prisma.Sql => Prisma.sql`
      o.status::text IN (${Prisma.join(PAID_ORDER_STATUSES)})
      AND o.currency = ${currency}
      AND o.created_at >= ${utcTimestamp(start)}
      AND o.created_at ${endInclusive ? Prisma.sql`<=` : Prisma.sql`<`} ${utcTimestamp(end)}`;
    const where = paidIn(from, to, true);
    const previousWhere = paidIn(previousFrom, from, false);
    const lines = scope
      ? Prisma.sql`AND f.seller_id = ${scope.sellerId}::uuid`
      : Prisma.empty;

    const seriesQuery = scope
      ? this.prisma.$queryRaw<SeriesRow[]>`
        SELECT date_trunc(${interval}, o.created_at) AS "periodStart",
               COUNT(DISTINCT o.id)::bigint AS "orderCount",
               COALESCE(SUM(oi.line_total), 0)::bigint AS "grossAmount"
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN offers f ON f.id = oi.offer_id
        WHERE ${where} ${lines}
        GROUP BY 1
        ORDER BY 1`
      : this.prisma.$queryRaw<SeriesRow[]>`
        SELECT date_trunc(${interval}, o.created_at) AS "periodStart",
               COUNT(*)::bigint AS "orderCount",
               COALESCE(SUM(o.total), 0)::bigint AS "grossAmount"
        FROM orders o
        WHERE ${where}
        GROUP BY 1
        ORDER BY 1`;
    const previousQuery = scope
      ? this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(DISTINCT o.id)::bigint AS "orderCount",
               COALESCE(SUM(oi.line_total), 0)::bigint AS "grossAmount"
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN offers f ON f.id = oi.offer_id
        WHERE ${previousWhere} ${lines}`
      : this.prisma.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::bigint AS "orderCount",
               COALESCE(SUM(o.total), 0)::bigint AS "grossAmount"
        FROM orders o
        WHERE ${previousWhere}`;

    const [seriesRows, previousRows, topRows, categoryRows, sellerRows] =
      await Promise.all([
        seriesQuery,
        previousQuery,
        this.prisma.$queryRaw<TopProductRow[]>`
        SELECT p.id AS "productId",
               p.name AS "productName",
               SUM(oi.quantity)::bigint AS "unitsSold",
               SUM(oi.line_total)::bigint AS "grossAmount"
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN offers f ON f.id = oi.offer_id
        JOIN product_variants v ON v.id = f.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE ${where} ${lines}
        GROUP BY p.id, p.name
        ORDER BY "unitsSold" DESC, "grossAmount" DESC, p.id
        LIMIT ${TOP_PRODUCT_LIMIT}`,
        this.prisma.$queryRaw<CategoryRow[]>`
        SELECT c.id AS "categoryId",
               c.name AS "categoryName",
               SUM(oi.quantity)::bigint AS "unitsSold",
               SUM(oi.line_total)::bigint AS "grossAmount"
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN offers f ON f.id = oi.offer_id
        JOIN product_variants v ON v.id = f.variant_id
        JOIN products p ON p.id = v.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${where} ${lines}
        GROUP BY c.id, c.name
        ORDER BY "grossAmount" DESC, c.name
        LIMIT ${CATEGORY_LIMIT}`,
        scope
          ? Promise.resolve([] as SellerRow[])
          : this.prisma.$queryRaw<SellerRow[]>`
        SELECT f.seller_id AS "sellerId",
               s.display_name AS "sellerName",
               s.storefront_slug AS "storefrontSlug",
               COUNT(DISTINCT o.id)::bigint AS "orderCount",
               SUM(oi.line_total)::bigint AS "grossAmount"
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN offers f ON f.id = oi.offer_id
        LEFT JOIN sellers s ON s.id = f.seller_id
        WHERE ${where}
        GROUP BY f.seller_id, s.display_name, s.storefront_slug
        ORDER BY "grossAmount" DESC
        LIMIT ${TOP_SELLER_LIMIT}`,
      ]);

    const series = this.zeroFill(seriesRows, from, to, interval);
    const previous = previousRows[0];

    return {
      currency,
      interval,
      from: from.toISOString(),
      to: to.toISOString(),
      series,
      totals: toTotals(
        series.reduce((sum, point) => sum + point.orderCount, 0),
        series.reduce((sum, point) => sum + point.grossAmount, 0),
      ),
      previous: toTotals(
        Number(previous?.orderCount ?? 0),
        Number(previous?.grossAmount ?? 0),
      ),
      topProducts: topRows.map(
        (row): SalesTopProduct => ({
          productId: row.productId,
          productName: row.productName,
          unitsSold: Number(row.unitsSold),
          grossAmount: Number(row.grossAmount),
        }),
      ),
      byCategory: categoryRows.map(
        (row): SalesCategoryShare => ({
          categoryId: row.categoryId,
          categoryName: row.categoryName ?? 'Uncategorised',
          unitsSold: Number(row.unitsSold),
          grossAmount: Number(row.grossAmount),
        }),
      ),
      ...(scope
        ? {}
        : {
            topSellers: sellerRows.map(
              (row): SalesTopSeller => ({
                sellerId: row.sellerId,
                sellerName:
                  row.sellerId === null
                    ? FIRST_PARTY_NAME
                    : (row.sellerName ?? 'Unnamed store'),
                storefrontSlug: row.storefrontSlug,
                orderCount: Number(row.orderCount),
                grossAmount: Number(row.grossAmount),
              }),
            ),
          }),
    };
  }

  /** One point per bucket from `from`'s bucket through `to`'s, including
   * buckets with no orders, so a chart never has to guess at gaps. */
  private zeroFill(
    rows: SeriesRow[],
    from: Date,
    to: Date,
    interval: SalesInterval,
  ): SalesSeriesPoint[] {
    const byStart = new Map(
      rows.map((row) => [
        truncateUtc(new Date(row.periodStart), interval).getTime(),
        row,
      ]),
    );
    const series: SalesSeriesPoint[] = [];
    for (
      let start = truncateUtc(from, interval);
      start.getTime() <= to.getTime();
      start = nextPeriod(start, interval)
    ) {
      const row = byStart.get(start.getTime());
      series.push({
        periodStart: start.toISOString(),
        orderCount: row ? Number(row.orderCount) : 0,
        grossAmount: row ? Number(row.grossAmount) : 0,
      });
    }
    return series;
  }

  private resolveRange(
    fromInput?: string,
    toInput?: string,
  ): { from: Date; to: Date } {
    const to = toInput ? new Date(toInput) : new Date();
    const from = fromInput
      ? new Date(fromInput)
      : new Date(to.getTime() - DEFAULT_RANGE_MS);

    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('`to` must be after `from`.');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('The date range must not exceed 366 days.');
    }
    return { from, to };
  }
}
