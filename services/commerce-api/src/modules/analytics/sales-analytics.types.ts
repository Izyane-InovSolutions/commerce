import type { SalesInterval } from './dto/sales-analytics-query.dto';

export type SalesSeriesPoint = {
  /** UTC start of the bucket (weeks start on Monday). */
  periodStart: string;
  orderCount: number;
  /** Sum of Order.total (items + shipping), minor units. */
  grossAmount: number;
};

export type SalesTopProduct = {
  productId: string;
  productName: string;
  unitsSold: number;
  /** Sum of OrderItem.lineTotal, minor units. */
  grossAmount: number;
};

export type SalesAnalyticsDto = {
  currency: string;
  interval: SalesInterval;
  from: string;
  to: string;
  series: SalesSeriesPoint[];
  totals: {
    orderCount: number;
    grossAmount: number;
    /** grossAmount / orderCount, rounded to a whole minor unit; 0 with no orders. */
    averageOrderAmount: number;
  };
  topProducts: SalesTopProduct[];
};
