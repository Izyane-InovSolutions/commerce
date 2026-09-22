import { BadRequestException, Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderStatus,
  Prisma,
  RefundCaseSource,
  RefundCaseStatus,
  ReturnStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OperationsMetricsQueryDto } from './dto/operations-metrics-query.dto';
import {
  FulfillmentMetrics,
  InventoryMetrics,
  OperationsMetricsDto,
  OrdersByStatusMetrics,
  ReturnsMetrics,
  SalesMetrics,
} from './operations-metrics.types';

const DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

// Orders that started as paid — PENDING_PAYMENT/CANCELLED never collected
// money, so they're excluded from every sales-adjacent figure below.
const PAID_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PARTIALLY_REFUNDED,
  OrderStatus.REFUNDED,
];

// DISPATCHED/CANCELLED are the only states with no further work item;
// PARTIALLY_DISPATCHED and PARTIALLY_CANCELLED still have remaining lines
// to move, so they stay "in flight" for backlog/aging purposes.
const TERMINAL_FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.DISPATCHED,
  FulfillmentStatus.CANCELLED,
];

// The documented ReturnStatus state diagram shows no outgoing transition
// from any of these, including PARTIALLY_REFUNDED, so all are terminal.
const TERMINAL_RETURN_STATUSES: ReturnStatus[] = [
  ReturnStatus.REJECTED,
  ReturnStatus.CANCELLED,
  ReturnStatus.CLOSED_NO_REFUND,
  ReturnStatus.REFUNDED,
  ReturnStatus.REFUND_FAILED,
  ReturnStatus.PARTIALLY_REFUNDED,
];

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (60 * 60 * 1000);
}

@Injectable()
export class OperationsMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(
    query: OperationsMetricsQueryDto,
  ): Promise<OperationsMetricsDto> {
    const { from, to } = this.resolveRange(query.from, query.to);
    const range: Prisma.DateTimeFilter = { gte: from, lte: to };

    const sales = await this.getSales(range, query.warehouseId);
    const [ordersByStatus, fulfillment, inventory, returns] =
      await Promise.all([
        this.getOrdersByStatus(range, query.orderStatuses),
        this.getFulfillment(range, query.warehouseId, query.fulfillmentStatuses),
        this.getInventory(query.warehouseId),
        this.getReturns(
          range,
          query.warehouseId,
          query.returnStatuses,
          sales.paidOrderCount,
        ),
      ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      sales,
      ordersByStatus,
      fulfillment,
      inventory,
      returns,
    };
  }

  private resolveRange(fromInput?: string, toInput?: string): { from: Date; to: Date } {
    const to = toInput ? new Date(toInput) : new Date();
    const from = fromInput
      ? new Date(fromInput)
      : new Date(to.getTime() - DEFAULT_RANGE_MS);

    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('`to` must be after `from`.');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException(
        'The date range must not exceed 366 days.',
      );
    }
    return { from, to };
  }

  private async getSales(
    range: Prisma.DateTimeFilter,
    warehouseId?: string,
  ): Promise<SalesMetrics> {
    // Order has no separate "paidAt" column, so "became paid" is
    // approximated by createdAt for orders that reached a paid status.
    // Orders/gross-sales are never warehouse-filtered here: an Order can
    // span multiple warehouses via its fulfillment orders.
    const orderAgg = await this.prisma.order.aggregate({
      where: { createdAt: range, status: { in: PAID_ORDER_STATUSES } },
      _count: { _all: true },
      _sum: { total: true },
    });

    const refundCases = await this.prisma.refundCase.findMany({
      where: { status: RefundCaseStatus.SUCCEEDED, createdAt: range },
      select: {
        amount: true,
        shippingAmount: true,
        source: true,
        returnRequest: { select: { warehouseId: true } },
      },
    });

    let itemRefunds = 0;
    let shippingRefunds = 0;
    for (const refundCase of refundCases) {
      // Only RETURN-sourced cases carry a warehouse (via their
      // ReturnRequest); other sources are excluded once a warehouse
      // filter is active, since they aren't attributable to one.
      if (warehouseId) {
        const caseWarehouseId =
          refundCase.source === RefundCaseSource.RETURN
            ? refundCase.returnRequest?.warehouseId ?? null
            : null;
        if (caseWarehouseId !== warehouseId) {
          continue;
        }
      }
      itemRefunds += refundCase.amount - refundCase.shippingAmount;
      shippingRefunds += refundCase.shippingAmount;
    }

    const grossSales = orderAgg._sum.total ?? 0;
    return {
      paidOrderCount: orderAgg._count._all,
      grossSales,
      itemRefunds,
      shippingRefunds,
      netSales: grossSales - itemRefunds - shippingRefunds,
    };
  }

  private async getOrdersByStatus(
    range: Prisma.DateTimeFilter,
    orderStatuses?: OrderStatus[],
  ): Promise<OrdersByStatusMetrics> {
    const where: Prisma.OrderWhereInput = { createdAt: range };
    if (orderStatuses?.length) {
      where.status = { in: orderStatuses };
    }
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  private async getFulfillment(
    range: Prisma.DateTimeFilter,
    warehouseId?: string,
    fulfillmentStatuses?: FulfillmentStatus[],
  ): Promise<FulfillmentMetrics> {
    // Backlog/aging describe the current in-flight workload, not a
    // date-range slice, so they intentionally ignore `range`.
    const backlogWhere: Prisma.FulfillmentOrderWhereInput = {
      status: { notIn: TERMINAL_FULFILLMENT_STATUSES },
      ...(warehouseId ? { warehouseId } : {}),
    };

    const statusWhere: Prisma.FulfillmentOrderWhereInput = {
      createdAt: range,
      ...(warehouseId ? { warehouseId } : {}),
      ...(fulfillmentStatuses?.length
        ? { status: { in: fulfillmentStatuses } }
        : {}),
    };

    const [backlogCount, statusGroups, backlogRows] = await Promise.all([
      this.prisma.fulfillmentOrder.count({ where: backlogWhere }),
      this.prisma.fulfillmentOrder.groupBy({
        by: ['status'],
        where: statusWhere,
        _count: { _all: true },
      }),
      this.prisma.fulfillmentOrder.findMany({
        where: backlogWhere,
        select: { createdAt: true },
      }),
    ]);

    const now = new Date();
    const ageHours = backlogRows.map((row) => hoursBetween(row.createdAt, now));

    return {
      backlogCount,
      statusTotals: statusGroups.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
      aging: {
        averageAgeHours: average(ageHours),
        maxAgeHours: ageHours.length ? Math.max(...ageHours) : null,
      },
    };
  }

  private async getInventory(warehouseId?: string): Promise<InventoryMetrics> {
    // Inventory is a current snapshot — deliberately not date-filtered.
    const records = await this.prisma.inventoryRecord.findMany({
      where: warehouseId ? { warehouseId } : {},
      select: { onHand: true, reserved: true, reorderPoint: true },
    });

    let onHand = 0;
    let reserved = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    for (const record of records) {
      onHand += record.onHand;
      reserved += record.reserved;
      const available = record.onHand - record.reserved;
      // Mutually exclusive buckets: out-of-stock takes precedence so a
      // record is never counted in both.
      if (available <= 0) {
        outOfStockCount += 1;
      } else if (available <= record.reorderPoint) {
        lowStockCount += 1;
      }
    }

    return {
      onHand,
      reserved,
      available: onHand - reserved,
      outOfStockCount,
      lowStockCount,
    };
  }

  private async getReturns(
    range: Prisma.DateTimeFilter,
    warehouseId: string | undefined,
    returnStatuses: ReturnStatus[] | undefined,
    paidOrderCount: number,
  ): Promise<ReturnsMetrics> {
    const returnRequestWhere: Prisma.ReturnRequestWhereInput = {
      createdAt: range,
      ...(warehouseId ? { warehouseId } : {}),
      ...(returnStatuses?.length ? { status: { in: returnStatuses } } : {}),
    };

    const [statusGroups, reasonGroups, inspectionAgg, refundAgg, returnRequestCount] =
      await Promise.all([
        this.prisma.returnRequest.groupBy({
          by: ['status'],
          where: returnRequestWhere,
          _count: { _all: true },
        }),
        this.prisma.returnItem.groupBy({
          by: ['reasonCode'],
          where: { returnRequest: returnRequestWhere },
          _count: { _all: true },
        }),
        this.prisma.returnInspectionLine.aggregate({
          where: {
            disposition: { not: null },
            inspection: { returnRequest: returnRequestWhere },
          },
          _sum: { acceptedQuantity: true },
        }),
        this.prisma.refundCase.aggregate({
          where: {
            source: RefundCaseSource.RETURN,
            status: RefundCaseStatus.SUCCEEDED,
            createdAt: range,
            ...(warehouseId || returnStatuses?.length
              ? { returnRequest: returnRequestWhere }
              : {}),
          },
          _sum: { amount: true },
        }),
        this.prisma.returnRequest.count({ where: returnRequestWhere }),
      ]);

    const openRows = await this.prisma.returnRequest.findMany({
      where: {
        status: { notIn: TERMINAL_RETURN_STATUSES },
        ...(warehouseId ? { warehouseId } : {}),
      },
      select: { createdAt: true },
    });
    const closedRows = await this.prisma.returnRequest.findMany({
      where: { ...returnRequestWhere, status: { in: TERMINAL_RETURN_STATUSES } },
      select: { createdAt: true, updatedAt: true },
    });

    const now = new Date();
    const openAgeHours = openRows.map((row) => hoursBetween(row.createdAt, now));
    // updatedAt is used as a proxy for "closed at" — the schema has no
    // dedicated closedAt column, and the last update to a terminal-status
    // row is, in practice, the transition into that terminal status.
    const closedAgeHours = closedRows.map((row) =>
      hoursBetween(row.createdAt, row.updatedAt),
    );

    return {
      countsByStatus: statusGroups.map((g) => ({
        status: g.status,
        count: g._count._all,
      })),
      countsByReasonCode: reasonGroups.map((g) => ({
        reasonCode: g.reasonCode,
        count: g._count._all,
      })),
      returnedQuantity: inspectionAgg._sum.acceptedQuantity ?? 0,
      refundValue: refundAgg._sum.amount ?? 0,
      // Distinct ReturnRequest count in range divided by paid Order count
      // in the same range — one of several defensible "return rate"
      // readings (vs. item-quantity-based); this one is simplest to reason
      // about across warehouse/status filters.
      returnRate: paidOrderCount > 0 ? returnRequestCount / paidOrderCount : null,
      processingAgeHours: {
        openAverageAgeHours: average(openAgeHours),
        closedAverageAgeHours: average(closedAgeHours),
      },
    };
  }
}
