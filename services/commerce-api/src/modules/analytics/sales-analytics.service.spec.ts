import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { SalesAnalyticsQueryDto } from './dto/sales-analytics-query.dto';
import { SalesAnalyticsService, truncateUtc } from './sales-analytics.service';

type SqlArg = { strings: string[]; values: unknown[] } | TemplateStringsArray;

function query(
  overrides: Partial<SalesAnalyticsQueryDto>,
): SalesAnalyticsQueryDto {
  return { interval: 'day', currency: 'ZMW', ...overrides } as SalesAnalyticsQueryDto;
}

describe('SalesAnalyticsService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let service: SalesAnalyticsService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    service = new SalesAnalyticsService(prisma as unknown as PrismaService);
  });

  it('zero-fills every day in range and totals the buckets', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          periodStart: new Date('2026-09-02T00:00:00.000Z'),
          orderCount: 2n,
          grossAmount: 3001n,
        },
      ])
      .mockResolvedValueOnce([{ orderCount: 1n, grossAmount: 1000n }])
      .mockResolvedValueOnce([
        {
          productId: 'p1',
          productName: 'Widget',
          unitsSold: 4n,
          grossAmount: 2000n,
        },
      ]);

    const result = await service.getSales(
      query({
        from: '2026-09-01T08:00:00.000Z',
        to: '2026-09-03T12:00:00.000Z',
      }),
    );

    expect(result.series).toEqual([
      { periodStart: '2026-09-01T00:00:00.000Z', orderCount: 0, grossAmount: 0 },
      { periodStart: '2026-09-02T00:00:00.000Z', orderCount: 2, grossAmount: 3001 },
      { periodStart: '2026-09-03T00:00:00.000Z', orderCount: 0, grossAmount: 0 },
    ]);
    expect(result.totals).toEqual({
      orderCount: 2,
      grossAmount: 3001,
      averageOrderAmount: 1501,
    });
    expect(result.topProducts).toEqual([
      { productId: 'p1', productName: 'Widget', unitsSold: 4, grossAmount: 2000 },
    ]);
    expect(result).toMatchObject({
      currency: 'ZMW',
      interval: 'day',
      from: '2026-09-01T08:00:00.000Z',
      to: '2026-09-03T12:00:00.000Z',
    });
  });

  it('compares with the previous window and breaks sales down by category and store', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orderCount: 4n, grossAmount: 8000n }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { categoryId: 'c1', categoryName: 'Phones', unitsSold: 3n, grossAmount: 6000n },
        { categoryId: null, categoryName: null, unitsSold: 1n, grossAmount: 500n },
      ])
      .mockResolvedValueOnce([
        { sellerId: null, sellerName: null, storefrontSlug: null, orderCount: 2n, grossAmount: 4000n },
        { sellerId: 's1', sellerName: 'Acme', storefrontSlug: 'acme', orderCount: 1n, grossAmount: 2500n },
      ]);

    const result = await service.getSales(
      query({ from: '2026-09-10T00:00:00.000Z', to: '2026-09-20T00:00:00.000Z' }),
    );

    expect(result.previous).toEqual({
      orderCount: 4,
      grossAmount: 8000,
      averageOrderAmount: 2000,
    });
    expect(result.byCategory.map((row) => row.categoryName)).toEqual([
      'Phones',
      'Uncategorised',
    ]);
    expect(result.topSellers).toEqual([
      { sellerId: null, sellerName: 'iZyane', storefrontSlug: null, orderCount: 2, grossAmount: 4000 },
      { sellerId: 's1', sellerName: 'Acme', storefrontSlug: 'acme', orderCount: 1, grossAmount: 2500 },
    ]);
  });

  it("scopes a seller's report to their own order lines and leaves stores out", async () => {
    const result = await service.getSales(
      query({ from: '2026-09-10T00:00:00.000Z', to: '2026-09-20T00:00:00.000Z' }),
      { sellerId: 'seller-1' },
    );

    // Series, previous, products and categories — no per-store query.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    // The seller id rides in a nested Prisma.sql fragment in every query.
    for (const call of prisma.$queryRaw.mock.calls) {
      expect(JSON.stringify(call)).toContain('seller-1');
    }
    expect(result.topSellers).toBeUndefined();
  });

  it('only counts paid statuses in the requested currency', async () => {
    await service.getSales(
      query({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z' }),
    );

    const values = prisma.$queryRaw.mock.calls.flatMap((call: SqlArg[]) =>
      call.slice(1),
    );
    const flattened = JSON.stringify(values);
    for (const status of ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'])
      expect(flattened).toContain(status);
    expect(flattened).not.toContain('PENDING_PAYMENT');
    expect(flattened).toContain('ZMW');
  });

  it('buckets by ISO week (Monday) and by calendar month', async () => {
    const weekly = await service.getSales(
      query({
        interval: 'week',
        from: '2026-09-02T00:00:00.000Z', // Wednesday
        to: '2026-09-15T00:00:00.000Z',
      }),
    );
    expect(weekly.series.map((point) => point.periodStart)).toEqual([
      '2026-08-31T00:00:00.000Z',
      '2026-09-07T00:00:00.000Z',
      '2026-09-14T00:00:00.000Z',
    ]);

    const monthly = await service.getSales(
      query({
        interval: 'month',
        from: '2026-01-31T00:00:00.000Z',
        to: '2026-03-01T00:00:00.000Z',
      }),
    );
    expect(monthly.series.map((point) => point.periodStart)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ]);
  });

  it('defaults to the trailing 30 days and reports 0 average with no orders', async () => {
    const result = await service.getSales(query({}));

    const span = new Date(result.to).getTime() - new Date(result.from).getTime();
    expect(span).toBe(30 * 24 * 60 * 60 * 1000);
    expect(result.series.length).toBeGreaterThanOrEqual(30);
    expect(result.totals).toEqual({
      orderCount: 0,
      grossAmount: 0,
      averageOrderAmount: 0,
    });
    expect(result.topProducts).toEqual([]);
  });

  it('rejects inverted and over-long ranges', async () => {
    await expect(
      service.getSales(
        query({ from: '2026-09-02T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getSales(
        query({ from: '2024-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('truncates to UTC period starts', () => {
    const date = new Date('2026-09-06T23:59:59.000Z'); // Sunday
    expect(truncateUtc(date, 'day').toISOString()).toBe('2026-09-06T00:00:00.000Z');
    expect(truncateUtc(date, 'week').toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(truncateUtc(date, 'month').toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
