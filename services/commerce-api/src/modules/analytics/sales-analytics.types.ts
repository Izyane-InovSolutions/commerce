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

export type SalesTotals = {
  orderCount: number;
  grossAmount: number;
  /** grossAmount / orderCount, rounded to a whole minor unit; 0 with no orders. */
  averageOrderAmount: number;
};

/** Line-item sales in one product category. */
export type SalesCategoryShare = {
  /** Null for products filed under no category. */
  categoryId: string | null;
  categoryName: string;
  unitsSold: number;
  /** Sum of OrderItem.lineTotal, minor units. */
  grossAmount: number;
};

/** Line-item sales through one store; the platform's own offers are the
 * first-party row (sellerId null). */
export type SalesTopSeller = {
  sellerId: string | null;
  sellerName: string;
  storefrontSlug: string | null;
  orderCount: number;
  grossAmount: number;
};

export type SalesAnalyticsDto = {
  currency: string;
  interval: SalesInterval;
  from: string;
  to: string;
  series: SalesSeriesPoint[];
  totals: SalesTotals;
  /** The same-length window just before `from`, for period-on-period change. */
  previous: SalesTotals;
  topProducts: SalesTopProduct[];
  /** Biggest categories first, at most eight. */
  byCategory: SalesCategoryShare[];
  /** Platform-wide reports only; a seller's own report leaves it out. */
  topSellers?: SalesTopSeller[];
};
