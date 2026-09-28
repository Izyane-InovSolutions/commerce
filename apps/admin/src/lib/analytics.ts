import {
  backendAnalyticsIntervals,
  backendCurrencies,
  defaultBackendCurrency,
  type BackendAnalyticsInterval,
  type BackendSalesAnalyticsPoint,
  type BackendSalesAnalyticsQuery,
} from '@commerce/contracts';

import {
  addDays,
  endOfDayIso,
  isIsoDate,
  startOfDayIso,
  todayIsoDate,
} from './date-range';
import { readParam, type RawSearchParams } from './search-params';

/** The report's filters as the URL carries them, after validation. */
export type SalesReportFilters = {
  /** Inclusive UTC calendar dates, `YYYY-MM-DD`. */
  from: string;
  to: string;
  interval: BackendAnalyticsInterval;
  currency: string;
};

/** The default window — the last 30 days, today included. */
export const DEFAULT_REPORT_DAYS = 30;

/** Past this many buckets the chart is unreadable, so the series stops filling. */
const MAX_BUCKETS = 1000;

function isInterval(value: string): value is BackendAnalyticsInterval {
  return (backendAnalyticsIntervals as readonly string[]).includes(value);
}

/**
 * Reads the report's filters from the URL.
 *
 * Each value is checked on its own, so one mangled date falls back to its
 * default without resetting the others. A range typed backwards is swapped
 * rather than refused — the reader plainly meant the span between the two.
 */
export function readSalesReportFilters(
  params: RawSearchParams,
  now: Date = new Date(),
): SalesReportFilters {
  const today = todayIsoDate(now);
  const toParam = readParam(params, 'to');
  const fromParam = readParam(params, 'from');
  const intervalParam = readParam(params, 'interval');
  const currencyParam = readParam(params, 'currency')?.toUpperCase();

  let to = toParam !== undefined && isIsoDate(toParam) ? toParam : today;
  let from =
    fromParam !== undefined && isIsoDate(fromParam)
      ? fromParam
      : addDays(to, -(DEFAULT_REPORT_DAYS - 1));
  if (from > to) {
    [from, to] = [to, from];
  }

  return {
    from,
    to,
    interval:
      intervalParam !== undefined && isInterval(intervalParam)
        ? intervalParam
        : 'day',
    currency:
      currencyParam !== undefined &&
      (backendCurrencies as readonly string[]).includes(currencyParam)
        ? currencyParam
        : defaultBackendCurrency,
  };
}

/** The filters as the API takes them: inclusive ISO bounds. */
export function toSalesAnalyticsQuery(
  filters: SalesReportFilters,
): BackendSalesAnalyticsQuery {
  return {
    from: startOfDayIso(filters.from),
    to: endOfDayIso(filters.to),
    interval: filters.interval,
    currency: filters.currency,
  };
}

/** The UTC date a bucket containing `date` starts on (weeks start Monday). */
export function bucketStart(
  date: string,
  interval: BackendAnalyticsInterval,
): string {
  switch (interval) {
    case 'day':
      return date;
    case 'week': {
      const weekday = new Date(startOfDayIso(date)).getUTCDay();
      // getUTCDay counts from Sunday; step back to the Monday on or before.
      return addDays(date, -((weekday + 6) % 7));
    }
    case 'month':
      return `${date.slice(0, 7)}-01`;
  }
}

function nextBucket(date: string, interval: BackendAnalyticsInterval): string {
  switch (interval) {
    case 'day':
      return addDays(date, 1);
    case 'week':
      return addDays(date, 7);
    case 'month': {
      const [year, month] = date.split('-').map(Number) as [number, number];
      return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    }
  }
}

/**
 * The series with every bucket in the range present.
 *
 * A quiet day is a real zero, and a chart that skips it draws a line straight
 * across the gap as though sales carried on. Buckets are matched on their UTC
 * date, and anything the API returned that does not land on an expected
 * boundary is kept rather than dropped, so a mismatch shows up as an odd
 * point instead of silently losing sales.
 */
export function fillSalesSeries(
  series: readonly BackendSalesAnalyticsPoint[],
  filters: Pick<SalesReportFilters, 'from' | 'to' | 'interval'>,
): BackendSalesAnalyticsPoint[] {
  const byDate = new Map<string, BackendSalesAnalyticsPoint>();
  for (const point of series) {
    const key = point.periodStart.slice(0, 10);
    const existing = byDate.get(key);
    byDate.set(
      key,
      existing
        ? {
            periodStart: existing.periodStart,
            orderCount: existing.orderCount + point.orderCount,
            grossAmount: existing.grossAmount + point.grossAmount,
          }
        : point,
    );
  }

  const filled: BackendSalesAnalyticsPoint[] = [];
  let cursor = bucketStart(filters.from, filters.interval);
  while (cursor <= filters.to && filled.length < MAX_BUCKETS) {
    filled.push(
      byDate.get(cursor) ?? {
        periodStart: startOfDayIso(cursor),
        orderCount: 0,
        grossAmount: 0,
      },
    );
    byDate.delete(cursor);
    cursor = nextBucket(cursor, filters.interval);
  }

  return [...filled, ...byDate.values()].sort((left, right) =>
    left.periodStart.localeCompare(right.periodStart),
  );
}

/** How a bucket is named on an axis or in a tooltip. */
export function formatBucket(
  periodStart: string,
  interval: BackendAnalyticsInterval,
  style: 'short' | 'long' = 'short',
): string {
  const date = new Date(periodStart);
  if (interval === 'month') {
    return date.toLocaleDateString('en-GB', {
      month: style === 'short' ? 'short' : 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(style === 'long' ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
  return interval === 'week' && style === 'long' ? `Week of ${day}` : day;
}
