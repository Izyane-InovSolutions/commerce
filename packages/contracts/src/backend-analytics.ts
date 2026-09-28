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

export type BackendSalesTotals = {
  orderCount: number;
  grossAmount: number;
  averageOrderAmount: number;
};

/** Line-item sales in one category (`categoryId` null = uncategorised). */
export type BackendSalesCategoryShare = {
  categoryId: string | null;
  categoryName: string;
  unitsSold: number;
  grossAmount: number;
};

/** Line-item sales through one store; `sellerId` null is the platform's own. */
export type BackendSalesTopSeller = {
  sellerId: string | null;
  sellerName: string;
  storefrontSlug: string | null;
  orderCount: number;
  grossAmount: number;
};

/**
 * The platform report (`/admin/analytics/sales`) and a seller's own
 * (`/sellers/me/analytics/sales`, over their order lines only, without
 * `topSellers`). `previous`, `byCategory` and `topSellers` are optional
 * because an API from before them doesn't send them.
 */
export type BackendSalesAnalytics = {
  currency: string;
  interval: BackendAnalyticsInterval;
  from: string;
  to: string;
  series: BackendSalesAnalyticsPoint[];
  totals: BackendSalesTotals;
  /** The same-length window just before `from`. */
  previous?: BackendSalesTotals;
  byCategory?: BackendSalesCategoryShare[];
  topSellers?: BackendSalesTopSeller[];
  topProducts: {
    productId: string;
    productName: string;
    unitsSold: number;
    grossAmount: number;
  }[];
};

/* ---- attention (GET /admin/analytics/attention, /sellers/me/analytics/attention) ---- */

/** A stock record at or under its reorder point (or 3 with none set). */
export type BackendLowStockItem = {
  inventoryRecordId: string;
  productId: string;
  productName: string;
  skuCode: string;
  warehouseName: string | null;
  available: number;
  reorderPoint: number;
};

export type BackendAdminAttention = {
  pendingSubmissions: number;
  pendingSellerApplications: number;
  openReturns: number;
  pendingPayoutRequests: number;
  openReviewReports: number;
  ordersToFulfil: number;
  fulfilmentOnHold: number;
  lowStock: number;
  outOfStock: number;
  lowStockItems: BackendLowStockItem[];
};

export type BackendSellerAttention = {
  ordersToFulfil: number;
  openReturns: number;
  pendingSubmissions: number;
  rejectedSubmissions: number;
  lowStock: number;
  outOfStock: number;
  lowStockItems: BackendLowStockItem[];
  rating: { average: number | null; count: number };
};
