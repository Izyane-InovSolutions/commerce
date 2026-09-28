import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import {
  SalesAnalyticsQueryDto,
  SalesInterval,
} from './dto/sales-analytics-query.dto';
import {
  SalesAnalyticsDto,
  SalesSeriesPoint,
  SalesTopProduct,
} from './sales-analytics.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 30 * DAY_MS;
const MAX_RANGE_MS = 366 * DAY_MS;
const TOP_PRODUCT_LIMIT = 10;

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
  async getSales(query: SalesAnalyticsQueryDto): Promise<SalesAnalyticsDto> {
    const interval = query.interval ?? 'day';
    const currency = query.currency;
    const { from, to } = this.resolveRange(query.from, query.to);

    const where = Prisma.sql`
      o.status::text IN (${Prisma.join(PAID_ORDER_STATUSES)})
      AND o.currency = ${currency}
      AND o.created_at >= ${utcTimestamp(from)}
      AND o.created_at <= ${utcTimestamp(to)}`;

    const [seriesRows, topRows] = await Promise.all([
      this.prisma.$queryRaw<SeriesRow[]>`
        SELECT date_trunc(${interval}, o.created_at) AS "periodStart",
               COUNT(*)::bigint AS "orderCount",
               COALESCE(SUM(o.total), 0)::bigint AS "grossAmount"
        FROM orders o
        WHERE ${where}
        GROUP BY 1
        ORDER BY 1`,
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
        WHERE ${where}
        GROUP BY p.id, p.name
        ORDER BY "unitsSold" DESC, "grossAmount" DESC, p.id
        LIMIT ${TOP_PRODUCT_LIMIT}`,
    ]);

    const series = this.zeroFill(seriesRows, from, to, interval);
    const orderCount = series.reduce((sum, point) => sum + point.orderCount, 0);
    const grossAmount = series.reduce(
      (sum, point) => sum + point.grossAmount,
      0,
    );

    return {
      currency,
      interval,
      from: from.toISOString(),
      to: to.toISOString(),
      series,
      totals: {
        orderCount,
        grossAmount,
        averageOrderAmount:
          orderCount > 0 ? Math.round(grossAmount / orderCount) : 0,
      },
      topProducts: topRows.map(
        (row): SalesTopProduct => ({
          productId: row.productId,
          productName: row.productName,
          unitsSold: Number(row.unitsSold),
          grossAmount: Number(row.grossAmount),
        }),
      ),
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
