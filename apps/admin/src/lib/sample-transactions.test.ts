import { describe, expect, it } from 'vitest';

import {
  aggregateTransactionsByMonth,
  sampleTransactionSeries,
} from './sample-transactions';

describe('sampleTransactionSeries', () => {
  it('defaults to a full year of daily rows', () => {
    const series = sampleTransactionSeries(undefined, new Date('2026-09-25'));

    expect(series).toHaveLength(365);
    expect(series.at(-1)?.date).toBe('2026-09-25');
  });

  it('is deterministic for the same end date', () => {
    const end = new Date('2026-09-25');
    expect(sampleTransactionSeries(30, end)).toEqual(
      sampleTransactionSeries(30, end),
    );
  });
});

describe('aggregateTransactionsByMonth', () => {
  it('rolls daily rows up into calendar-month totals, oldest first', () => {
    const days = sampleTransactionSeries(365, new Date('2026-09-25'));

    const months = aggregateTransactionsByMonth(days);

    // 365 days ending mid-September spans parts of 13 calendar months, not
    // an even 12 — the chart's own "last 12 months" range then slices the
    // 12 most recent of these off the end.
    expect(months).toHaveLength(13);
    expect(months.at(-1)?.month).toBe('2026-09');
    expect(months.map((entry) => entry.month)).toEqual(
      [...months].map((entry) => entry.month).sort(),
    );
  });

  it('sums card and mobile money across the days in each month', () => {
    const days = [
      { date: '2026-01-01', card: 100, mobileMoney: 50 },
      { date: '2026-01-02', card: 200, mobileMoney: 75 },
      { date: '2026-02-01', card: 10, mobileMoney: 5 },
    ];

    expect(aggregateTransactionsByMonth(days)).toEqual([
      { month: '2026-01', card: 300, mobileMoney: 125 },
      { month: '2026-02', card: 10, mobileMoney: 5 },
    ]);
  });
});
