import type {
  FulfillmentStatus,
  OrderStatus,
  ReturnReasonCode,
  ReturnStatus,
} from '@prisma/client';

export type OperationsMetricsRange = {
  from: string;
  to: string;
};

export type SalesMetrics = {
  paidOrderCount: number;
  // Sum of Order.total for orders counted in paidOrderCount.
  grossSales: number;
  // Sum of (RefundCase.amount - RefundCase.shippingAmount) for SUCCEEDED
  // RETURN-sourced cases in range.
  itemRefunds: number;
  // Sum of RefundCase.shippingAmount for SUCCEEDED cases in range.
  shippingRefunds: number;
  // grossSales - itemRefunds - shippingRefunds.
  netSales: number;
};

export type OrdersByStatusMetrics = {
  status: OrderStatus;
  count: number;
}[];

export type FulfillmentMetrics = {
  // Count of FulfillmentOrders not in a terminal status (DISPATCHED,
  // CANCELLED), regardless of the date range.
  backlogCount: number;
  statusTotals: { status: FulfillmentStatus; count: number }[];
  aging: {
    averageAgeHours: number | null;
    maxAgeHours: number | null;
  };
};

export type InventoryMetrics = {
  onHand: number;
  reserved: number;
  available: number;
  outOfStockCount: number;
  lowStockCount: number;
};

export type ReturnsMetrics = {
  countsByStatus: { status: ReturnStatus; count: number }[];
  countsByReasonCode: { reasonCode: ReturnReasonCode; count: number }[];
  // Sum of ReturnInspectionLine.acceptedQuantity where disposition is set,
  // in range.
  returnedQuantity: number;
  // Sum of RefundCase.amount where source = RETURN and status = SUCCEEDED,
  // in range.
  refundValue: number;
  // distinct ReturnRequest count in range / paid order count in range —
  // one of several reasonable "return rate" definitions; documented here
  // since the term is ambiguous by nature.
  returnRate: number | null;
  processingAgeHours: {
    // Average age (createdAt -> now) of ReturnRequests still open (status
    // not in a terminal set) at the time of the query.
    openAverageAgeHours: number | null;
    // Average age (createdAt -> updatedAt, a proxy for "closed at") of
    // ReturnRequests in a terminal status whose createdAt is in range.
    closedAverageAgeHours: number | null;
  };
};

export type OperationsMetricsDto = {
  range: OperationsMetricsRange;
  sales: SalesMetrics;
  ordersByStatus: OrdersByStatusMetrics;
  fulfillment: FulfillmentMetrics;
  inventory: InventoryMetrics;
  returns: ReturnsMetrics;
};
