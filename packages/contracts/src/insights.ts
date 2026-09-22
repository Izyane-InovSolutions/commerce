import { z } from 'zod';

import { moneySchema } from './common.ts';

/**
 * Dashboard insights.
 *
 * Every figure here is derived from catalog, offer and stock state. There is
 * no orders domain and no time dimension yet, so there is deliberately
 * nothing trend-shaped: a sales-over-time line would be invented, not
 * measured. When orders land, that is what adds the time series.
 */

/** One SKU's stock measured against the level it should be reordered at. */
export const stockPositionSchema = z.object({
  skuId: z.uuid(),
  skuCode: z.string(),
  productName: z.string(),
  available: z.int(),
  reorderThreshold: z.int(),
  /** `available - reorderThreshold`. Negative means it needs restocking. */
  delta: z.int(),
});
export type StockPosition = z.infer<typeof stockPositionSchema>;

/** How a seller's price compares with the best price on the same SKU. */
export const pricePositionSchema = z.object({
  skuId: z.uuid(),
  skuCode: z.string(),
  productName: z.string(),
  yourPrice: moneySchema,
  /** Lowest active price on this SKU from any approved seller. */
  bestPrice: moneySchema,
  /** Other approved sellers with an active offer on this SKU. */
  competitors: z.int().min(0),
  isBest: z.boolean(),
});
export type PricePosition = z.infer<typeof pricePositionSchema>;

export const sellerInsightsSchema = z.object({
  /** SKUs furthest below their reorder point first. */
  stock: z.array(stockPositionSchema),
  /** Only SKUs where the seller has an active offer. */
  prices: z.array(pricePositionSchema),
});
export type SellerInsights = z.infer<typeof sellerInsightsSchema>;

/**
 * Why an active product is, or is not, buyable.
 *
 * The reasons are evaluated in order and each product counts once, so the
 * four always sum to the number of active products.
 */
export const buyabilityReasons = [
  'onSale',
  'noOffer',
  'outOfStock',
  'sellerSuspended',
] as const;
export const buyabilityReasonSchema = z.enum(buyabilityReasons);
export type BuyabilityReason = z.infer<typeof buyabilityReasonSchema>;

export const buyabilitySchema = z.object({
  reason: buyabilityReasonSchema,
  products: z.int().min(0),
});
export type Buyability = z.infer<typeof buyabilitySchema>;

/** Who put each product into the shared catalog. */
export const contributionSchema = z.object({
  /** Null for products the platform itself added. */
  sellerId: z.uuid().nullable(),
  sellerName: z.string(),
  products: z.int().min(0),
});
export type Contribution = z.infer<typeof contributionSchema>;

/** How many products carry one active offer, two, three or more. */
export const offerDepthSchema = z.object({
  bucket: z.enum(['1', '2', '3+']),
  products: z.int().min(0),
});
export type OfferDepth = z.infer<typeof offerDepthSchema>;

export const adminInsightsSchema = z.object({
  buyability: z.array(buyabilitySchema),
  contribution: z.array(contributionSchema),
  offerDepth: z.array(offerDepthSchema),
  queue: z.object({
    applicationsPending: z.int().min(0),
    productsPending: z.int().min(0),
  }),
  totals: z.object({
    activeSellers: z.int().min(0),
    suspendedSellers: z.int().min(0),
    activeProducts: z.int().min(0),
    productsOnSale: z.int().min(0),
  }),
});
export type AdminInsights = z.infer<typeof adminInsightsSchema>;
