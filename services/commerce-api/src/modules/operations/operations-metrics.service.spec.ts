import { BadRequestException } from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderStatus,
  RefundCaseSource,
  RefundCaseStatus,
  ReturnStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OperationsMetricsQueryDto } from './dto/operations-metrics-query.dto';
import { OperationsMetricsService } from './operations-metrics.service';

function buildPrisma(): {
  order: { aggregate: jest.Mock; groupBy: jest.Mock };
  refundCase: { findMany: jest.Mock; aggregate: jest.Mock };
  fulfillmentOrder: { count: jest.Mock; groupBy: jest.Mock; findMany: jest.Mock };
  inventoryRecord: { findMany: jest.Mock };
  returnRequest: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock };
  returnItem: { groupBy: jest.Mock };
  returnInspectionLine: { aggregate: jest.Mock };
} {
  return {
    order: {
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 0 },
        _sum: { total: 0 },
      }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    refundCase: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    fulfillmentOrder: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    inventoryRecord: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    returnRequest: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    returnItem: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
    returnInspectionLine: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { acceptedQuantity: 0 } }),
    },
  };
}

function whereArg(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as { where: Record<string, unknown> }[][];
  return calls[0]![0]!.where;
}

describe('OperationsMetricsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: OperationsMetricsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new OperationsMetricsService(prisma as unknown as PrismaService);
  });

  it('defaults to a trailing 30-day window when from/to are omitted', async () => {
    const before = Date.now();
    const result = await service.getMetrics({} as OperationsMetricsQueryDto);
    const after = Date.now();

    const to = new Date(result.range.to).getTime();
    const from = new Date(result.range.from).getTime();

    expect(to).toBeGreaterThanOrEqual(before);
    expect(to).toBeLessThanOrEqual(after);
    expect(to - from).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -2);
  });

  it('rejects a range over 366 days', async () => {
    const to = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const from = new Date('2024-01-01T00:00:00.000Z').toISOString();

    await expect(
      service.getMetrics({ from, to } as OperationsMetricsQueryDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects to <= from', async () => {
    const from = new Date('2026-01-02T00:00:00.000Z').toISOString();
    const to = new Date('2026-01-01T00:00:00.000Z').toISOString();

    await expect(
      service.getMetrics({ from, to } as OperationsMetricsQueryDto),
    ).rejects.toThrow(BadRequestException);

    const equal = new Date('2026-01-01T00:00:00.000Z').toISOString();
    await expect(
      service.getMetrics({
        from: equal,
        to: equal,
      } as OperationsMetricsQueryDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('narrows inventory, fulfillment, and return sections by warehouseId', async () => {
    await service.getMetrics({
      warehouseId: 'wh-1',
    } as OperationsMetricsQueryDto);

    expect(prisma.inventoryRecord.findMany).toHaveBeenCalledWith({
      where: { warehouseId: 'wh-1' },
      select: { onHand: true, reserved: true, reorderPoint: true },
    });

    expect(whereArg(prisma.fulfillmentOrder.count).warehouseId).toBe('wh-1');
    expect(whereArg(prisma.fulfillmentOrder.groupBy).warehouseId).toBe('wh-1');
    expect(whereArg(prisma.returnRequest.groupBy).warehouseId).toBe('wh-1');
  });

  it('narrows sections by their respective status filters', async () => {
    await service.getMetrics({
      orderStatuses: [OrderStatus.PAID],
      fulfillmentStatuses: [FulfillmentStatus.PICKING],
      returnStatuses: [ReturnStatus.REQUESTED],
    } as OperationsMetricsQueryDto);

    expect(whereArg(prisma.order.groupBy).status).toEqual({
      in: [OrderStatus.PAID],
    });
    expect(whereArg(prisma.fulfillmentOrder.groupBy).status).toEqual({
      in: [FulfillmentStatus.PICKING],
    });
    expect(whereArg(prisma.returnRequest.groupBy).status).toEqual({
      in: [ReturnStatus.REQUESTED],
    });
  });

  it('never date-filters the inventory query', async () => {
    await service.getMetrics({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-10T00:00:00.000Z',
    } as OperationsMetricsQueryDto);

    const inventoryWhere = whereArg(prisma.inventoryRecord.findMany);
    expect(inventoryWhere).not.toHaveProperty('createdAt');
    expect(JSON.stringify(inventoryWhere)).not.toContain('gte');
  });

  it('computes net sales as gross minus item and shipping refunds', async () => {
    prisma.order.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { total: 20000 },
    });
    prisma.refundCase.findMany.mockResolvedValue([
      {
        amount: 1500,
        shippingAmount: 500,
        source: RefundCaseSource.RETURN,
        returnRequest: { warehouseId: 'wh-1' },
      },
    ]);

    const result = await service.getMetrics({} as OperationsMetricsQueryDto);

    expect(result.sales).toEqual({
      paidOrderCount: 2,
      grossSales: 20000,
      itemRefunds: 1000,
      shippingRefunds: 500,
      netSales: 18500,
    });
  });

  it('excludes non-attributable refund cases from item/shipping refunds when filtering by warehouse', async () => {
    prisma.refundCase.findMany.mockResolvedValue([
      {
        amount: 1500,
        shippingAmount: 500,
        source: RefundCaseSource.ADMIN,
        returnRequest: null,
      },
      {
        amount: 900,
        shippingAmount: 100,
        source: RefundCaseSource.RETURN,
        returnRequest: { warehouseId: 'wh-1' },
      },
    ]);

    const result = await service.getMetrics({
      warehouseId: 'wh-1',
    } as OperationsMetricsQueryDto);

    expect(result.sales.itemRefunds).toBe(800);
    expect(result.sales.shippingRefunds).toBe(100);
  });

  it('computes fulfillment aging from backlog rows', async () => {
    const now = Date.now();
    prisma.fulfillmentOrder.findMany.mockResolvedValue([
      { createdAt: new Date(now - 2 * 60 * 60 * 1000) },
      { createdAt: new Date(now - 10 * 60 * 60 * 1000) },
    ]);

    const result = await service.getMetrics({} as OperationsMetricsQueryDto);

    expect(result.fulfillment.aging.averageAgeHours).toBeCloseTo(6, 0);
    expect(result.fulfillment.aging.maxAgeHours).toBeCloseTo(10, 0);
  });

  it('computes inventory buckets as mutually exclusive out-of-stock/low-stock', async () => {
    prisma.inventoryRecord.findMany.mockResolvedValue([
      { onHand: 0, reserved: 0, reorderPoint: 5 },
      { onHand: 5, reserved: 0, reorderPoint: 10 },
      { onHand: 100, reserved: 0, reorderPoint: 5 },
    ]);

    const result = await service.getMetrics({} as OperationsMetricsQueryDto);

    expect(result.inventory.outOfStockCount).toBe(1);
    expect(result.inventory.lowStockCount).toBe(1);
  });

  it('computes return rate as returnRequestCount / paidOrderCount', async () => {
    prisma.order.aggregate.mockResolvedValue({
      _count: { _all: 4 },
      _sum: { total: 40000 },
    });
    prisma.returnRequest.count.mockResolvedValue(2);

    const result = await service.getMetrics({} as OperationsMetricsQueryDto);

    expect(result.returns.returnRate).toBe(0.5);
  });

  it('returns null return rate when there are no paid orders', async () => {
    prisma.order.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { total: 0 },
    });
    prisma.returnRequest.count.mockResolvedValue(3);

    const result = await service.getMetrics({} as OperationsMetricsQueryDto);

    expect(result.returns.returnRate).toBeNull();
  });

  it('only counts SUCCEEDED cases toward refund value', async () => {
    await service.getMetrics({} as OperationsMetricsQueryDto);

    expect(whereArg(prisma.refundCase.aggregate)).toEqual(
      expect.objectContaining({
        source: RefundCaseSource.RETURN,
        status: RefundCaseStatus.SUCCEEDED,
      }),
    );
  });
});
