import { z } from 'zod';

import { productStatusSchema } from './catalog.ts';
import { listQuerySchema, moneySchema } from './common.ts';
import { offerStatusSchema } from './offers.ts';

/**
 * A seller's own view of what they sell.
 *
 * The domain keeps products and offers separate — the platform owns the
 * product, the seller owns the offer against its SKU. A seller does not think
 * that way, so this flattens both into one row per SKU: what the item is, what
 * they charge for it, and how many they hold.
 *
 * It covers SKUs they submitted *and* SKUs they only offer against, because
 * both are things they sell.
 */

export const sellerProductRowSchema = z.object({
  skuId: z.uuid(),
  skuCode: z.string(),
  variantName: z.string(),

  productId: z.uuid(),
  productName: z.string(),
  productSlug: z.string(),
  productStatus: productStatusSchema,
  /** Why an admin rejected the submission, when it was rejected. */
  rejectionReason: z.string().nullable(),
  /** True when this seller put the product into the catalog. */
  submittedByMe: z.boolean(),

  /** The seller's offer on this SKU, or null if they have not priced it. */
  offerId: z.uuid().nullable(),
  price: moneySchema.nullable(),
  offerStatus: offerStatusSchema.nullable(),

  /** The seller's own stock for this SKU, or null if they hold none. */
  onHand: z.int().nullable(),
  reserved: z.int().nullable(),
  available: z.int().nullable(),
  locationId: z.uuid().nullable(),
});
export type SellerProductRow = z.infer<typeof sellerProductRowSchema>;

/** The tabs of the seller's Products section. */
export const sellerCatalogViews = [
  'all',
  'draft',
  'pending',
  'active',
  'rejected',
] as const;
export const sellerCatalogViewSchema = z.enum(sellerCatalogViews);
export type SellerCatalogView = z.infer<typeof sellerCatalogViewSchema>;

export const sellerCatalogQuerySchema = listQuerySchema.extend({
  q: z.string().trim().optional(),
  view: sellerCatalogViewSchema.default('all'),
});
export type SellerCatalogQuery = z.infer<typeof sellerCatalogQuerySchema>;
