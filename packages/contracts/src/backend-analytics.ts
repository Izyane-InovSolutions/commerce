/* ---- sales analytics (GET /admin/analytics/sales) ---- */

export const backendAnalyticsIntervals = ['day', 'week', 'month'] as const;
export type BackendAnalyticsInterval =
  (typeof backendAnalyticsIntervals)[number];

/** `from`/`to` are ISO timestamps; the report covers one currency at a time. */
export type BackendSalesAnalyticsQuery = {
  from: string;
  to: string;
  interval: BackendAnalyticsInterval;
  currency: string;
};

/** One bucket of the series. Amounts are minor units, like every price. */
export type BackendSalesAnalyticsPoint = {
  /** ISO timestamp of the bucket's first instant. */
  periodStart: string;
  orderCount: number;
  grossAmount: number;
};

export type BackendSalesAnalytics = {
  currency: string;
  interval: BackendAnalyticsInterval;
  from: string;
  to: string;
  series: BackendSalesAnalyticsPoint[];
  totals: {
    orderCount: number;
    grossAmount: number;
    averageOrderAmount: number;
  };
  topProducts: {
    productId: string;
    productName: string;
    unitsSold: number;
    grossAmount: number;
  }[];
};
