import { describe, expect, it } from 'vitest';

import {
  bucketStart,
  fillSalesSeries,
  formatBucket,
  readSalesReportFilters,
  toSalesAnalyticsQuery,
} from './analytics';

const NOW = new Date('2026-09-28T10:00:00.000Z');

describe('readSalesReportFilters', () => {
  it('defaults to the last 30 days, daily, in Kwacha', () => {
    expect(readSalesReportFilters({}, NOW)).toEqual({
      from: '2026-08-30',
      to: '2026-09-28',
      interval: 'day',
      currency: 'ZMW',
    });
  });

  it('keeps valid values and drops only the broken ones', () => {
    expect(
      readSalesReportFilters(
        { from: '2026-02-30', to: '2026-03-31', interval: 'week' },
        NOW,
      ),
    ).toEqual({
      from: '2026-03-02',
      to: '2026-03-31',
      interval: 'week',
      currency: 'ZMW',
    });
  });

  it('swaps a range typed backwards', () => {
    const filters = readSalesReportFilters(
      { from: '2026-09-10', to: '2026-09-01' },
      NOW,
    );
    expect([filters.from, filters.to]).toEqual(['2026-09-01', '2026-09-10']);
  });

  it('ignores an unknown interval or currency', () => {
    const filters = readSalesReportFilters(
      { interval: 'hour', currency: 'usd' },
      NOW,
    );
    expect(filters.interval).toBe('day');
    expect(filters.currency).toBe('ZMW');
  });
});

describe('toSalesAnalyticsQuery', () => {
  it('sends the whole of the last day, not its midnight', () => {
    expect(
      toSalesAnalyticsQuery({
        from: '2026-09-01',
        to: '2026-09-07',
        interval: 'day',
        currency: 'ZMW',
      }),
    ).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-07T23:59:59.999Z',
      interval: 'day',
      currency: 'ZMW',
    });
  });
});

describe('bucketStart', () => {
  it('starts weeks on Monday', () => {
    // 2026-09-27 is a Sunday; 2026-09-21 the Monday before it.
    expect(bucketStart('2026-09-27', 'week')).toBe('2026-09-21');
    expect(bucketStart('2026-09-21', 'week')).toBe('2026-09-21');
  });

  it('starts months on the first', () => {
    expect(bucketStart('2026-09-27', 'month')).toBe('2026-09-01');
  });
});

describe('fillSalesSeries', () => {
  it('fills quiet days with zeros', () => {
    const filled = fillSalesSeries(
      [
        {
          periodStart: '2026-09-02T00:00:00.000Z',
          orderCount: 2,
          grossAmount: 5000,
        },
      ],
      { from: '2026-09-01', to: '2026-09-03', interval: 'day' },
    );

    expect(filled.map((point) => point.orderCount)).toEqual([0, 2, 0]);
    expect(filled[0]?.periodStart).toBe('2026-09-01T00:00:00.000Z');
  });

  it('walks month boundaries, including year ends', () => {
    const filled = fillSalesSeries([], {
      from: '2025-11-15',
      to: '2026-01-10',
      interval: 'month',
    });

    expect(filled.map((point) => point.periodStart.slice(0, 10))).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
    ]);
  });

  it('keeps a bucket that lands off the expected boundaries', () => {
    const filled = fillSalesSeries(
      [
        {
          periodStart: '2026-09-23T00:00:00.000Z',
          orderCount: 1,
          grossAmount: 100,
        },
      ],
      { from: '2026-09-21', to: '2026-09-27', interval: 'week' },
    );

    expect(filled).toHaveLength(2);
    expect(filled.reduce((sum, point) => sum + point.grossAmount, 0)).toBe(100);
  });
});

describe('formatBucket', () => {
  it('names each interval the way a reader would', () => {
    expect(formatBucket('2026-09-21T00:00:00.000Z', 'day')).toBe('21 Sept');
    expect(formatBucket('2026-09-21T00:00:00.000Z', 'week', 'long')).toBe(
      'Week of 21 Sept 2026',
    );
    expect(formatBucket('2026-09-01T00:00:00.000Z', 'month', 'long')).toBe(
      'September 2026',
    );
  });
});
