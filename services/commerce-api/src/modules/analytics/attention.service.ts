import { Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderStatus,
  Prisma,
  ProductSubmissionStatus,
  ReturnStatus,
  ReviewReportStatus,
  SellerPayoutStatus,
  SellerStatus,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/** Below this many sellable units a stock record counts as low when no
 * reorder point has been set for it. */
export const DEFAULT_LOW_STOCK = 3;
const LOW_STOCK_LIST = 6;

/** Fulfilment still to do: accepted work that hasn't left the building. */
const OPEN_FULFILMENT: FulfillmentStatus[] = [
  FulfillmentStatus.AWAITING_ACCEPTANCE,
  FulfillmentStatus.READY_TO_PICK,
  FulfillmentStatus.PICKING,
  FulfillmentStatus.PARTIALLY_PICKED,
  FulfillmentStatus.PICKED,
  FulfillmentStatus.PACKING,
  FulfillmentStatus.PARTIALLY_PACKED,
  FulfillmentStatus.PACKED,
  FulfillmentStatus.PARTIALLY_DISPATCHED,
  FulfillmentStatus.ON_HOLD,
];

/** Returns waiting on someone to act: decide, inspect, or retry a refund. */
const OPEN_RETURNS: ReturnStatus[] = [
  ReturnStatus.REQUESTED,
  ReturnStatus.RECEIVED,
  ReturnStatus.INSPECTING,
  ReturnStatus.REFUND_FAILED,
];

export type LowStockItem = {
  inventoryRecordId: string;
  productId: string;
  productName: string;
  skuCode: string;
  warehouseName: string | null;
  available: number;
  reorderPoint: number;
};

export type AdminAttention = {
  pendingSubmissions: number;
  pendingSellerApplications: number;
  openReturns: number;
  pendingPayoutRequests: number;
  openReviewReports: number;
  ordersToFulfil: number;
  fulfilmentOnHold: number;
  lowStock: number;
  outOfStock: number;
  lowStockItems: LowStockItem[];
};

export type SellerAttention = {
  ordersToFulfil: number;
  openReturns: number;
  pendingSubmissions: number;
  rejectedSubmissions: number;
  lowStock: number;
  outOfStock: number;
  lowStockItems: LowStockItem[];
  rating: { average: number | null; count: number };
};

type StockRow = {
  inventoryRecordId: string;
  productId: string;
  productName: string;
  skuCode: string;
  warehouseName: string | null;
  available: number;
  reorderPoint: number;
};
type StockCountRow = { low: bigint; out: bigint };

/**
 * What's waiting on someone, for the admin and seller dashboards: counts of
 * each queue (each one links to the page that works it) and the stock that
 * is running out. Nothing here is a trend — see SalesAnalyticsService.
 */
@Injectable()
export class AttentionService {
  constructor(private readonly prisma: PrismaService) {}

  async forAdmin(): Promise<AdminAttention> {
    const [
      pendingSubmissions,
      pendingSellerApplications,
      openReturns,
      pendingPayoutRequests,
      openReviewReports,
      ordersToFulfil,
      fulfilmentOnHold,
      stock,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { submissionStatus: ProductSubmissionStatus.PENDING },
      }),
      this.prisma.seller.count({ where: { status: SellerStatus.PENDING } }),
      this.prisma.returnRequest.count({
        where: { status: { in: OPEN_RETURNS } },
      }),
      this.prisma.sellerPayoutRequest.count({
        where: { status: SellerPayoutStatus.REQUESTED },
      }),
      this.prisma.reviewReport.count({
        where: { status: ReviewReportStatus.OPEN },
      }),
      this.prisma.fulfillmentOrder.count({
        where: { status: { in: OPEN_FULFILMENT } },
      }),
      this.prisma.fulfillmentOrder.count({
        where: { status: FulfillmentStatus.ON_HOLD },
      }),
      this.stock(Prisma.empty),
    ]);

    return {
      pendingSubmissions,
      pendingSellerApplications,
      openReturns,
      pendingPayoutRequests,
      openReviewReports,
      ordersToFulfil,
      fulfilmentOnHold,
      ...stock,
    };
  }

  async forSeller(sellerId: string): Promise<SellerAttention> {
    const [
      ordersToFulfil,
      openReturns,
      pendingSubmissions,
      rejectedSubmissions,
      stock,
      rating,
    ] = await Promise.all([
      this.prisma.sellerOrder.count({
        where: {
          sellerId,
          status: OrderStatus.PAID,
          fulfillmentOrders: { some: { status: { in: OPEN_FULFILMENT } } },
        },
      }),
      this.prisma.returnRequest.count({
        where: {
          status: { in: OPEN_RETURNS },
          items: { some: { orderItem: { sellerOrder: { sellerId } } } },
        },
      }),
      this.prisma.product.count({
        where: {
          createdBySellerId: sellerId,
          submissionStatus: ProductSubmissionStatus.PENDING,
        },
      }),
      this.prisma.product.count({
        where: {
          createdBySellerId: sellerId,
          submissionStatus: ProductSubmissionStatus.REJECTED,
        },
      }),
      // A seller's own stock is held against their offers.
      this.stock(Prisma.sql`AND f.seller_id = ${sellerId}::uuid`),
      this.prisma.sellerRatingSummary.findUnique({ where: { sellerId } }),
    ]);

    return {
      ordersToFulfil,
      openReturns,
      pendingSubmissions,
      rejectedSubmissions,
      ...stock,
      rating: {
        average:
          rating && rating.ratingCount > 0
            ? Math.round((rating.ratingSum / rating.ratingCount) * 10) / 10
            : null,
        count: rating?.ratingCount ?? 0,
      },
    };
  }

  /**
   * Low (at or under the record's reorder point, or DEFAULT_LOW_STOCK when
   * none is set) and out-of-stock records, lowest first. `scope` narrows the
   * records by the offer they're held against.
   */
  private async stock(scope: Prisma.Sql): Promise<{
    lowStock: number;
    outOfStock: number;
    lowStockItems: LowStockItem[];
  }> {
    const available = Prisma.sql`(r.on_hand - r.reserved)`;
    const threshold = Prisma.sql`CASE WHEN r.reorder_point > 0 THEN r.reorder_point ELSE ${DEFAULT_LOW_STOCK} END`;
    const joins = Prisma.sql`
      FROM inventory_records r
      JOIN product_variants v ON v.id = r.variant_id
      JOIN products p ON p.id = v.product_id
      LEFT JOIN offers f ON f.id = r.offer_id
      LEFT JOIN warehouses w ON w.id = r.warehouse_id
      WHERE p.status::text <> 'ARCHIVED' ${scope}`;

    const [counts, rows] = await Promise.all([
      this.prisma.$queryRaw<StockCountRow[]>`
        SELECT COUNT(*) FILTER (WHERE ${available} > 0 AND ${available} <= ${threshold})::bigint AS "low",
               COUNT(*) FILTER (WHERE ${available} <= 0)::bigint AS "out"
        ${joins}`,
      this.prisma.$queryRaw<StockRow[]>`
        SELECT r.id AS "inventoryRecordId",
               p.id AS "productId",
               p.name AS "productName",
               v.sku_code AS "skuCode",
               w.name AS "warehouseName",
               ${available}::int AS "available",
               r.reorder_point AS "reorderPoint"
        ${joins}
          AND ${available} <= ${threshold}
        ORDER BY ${available} ASC, p.name
        LIMIT ${LOW_STOCK_LIST}`,
    ]);

    return {
      lowStock: Number(counts[0]?.low ?? 0),
      outOfStock: Number(counts[0]?.out ?? 0),
      lowStockItems: rows.map((row) => ({
        ...row,
        available: Number(row.available),
        reorderPoint: Number(row.reorderPoint),
      })),
    };
  }
}
