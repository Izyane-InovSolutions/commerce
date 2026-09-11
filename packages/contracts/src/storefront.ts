import { z } from 'zod';

import { productSchema } from './catalog.ts';
import { listQuerySchema, moneySchema } from './common.ts';
import { offerConditionSchema, offerSchema } from './offers.ts';

/**
 * Public storefront contract.
 *
 * These are the only endpoints a shopper's client needs, and the only ones
 * that require no authentication. The API decides what is publicly visible:
 * an active product with at least one active offer from an approved seller.
 * No client-side filtering is involved, so an unapproved seller's stock can
 * never leak by a caller forgetting a filter.
 */

export const storefrontOfferSchema = offerSchema.pick({
  id: true,
  skuId: true,
  skuCode: true,
  variantName: true,
  sellerId: true,
  sellerName: true,
  price: true,
  compareAtPrice: true,
  condition: true,
  fulfillmentMode: true,
  handlingTimeDays: true,
});
export type StorefrontOffer = z.infer<typeof storefrontOfferSchema>;

export const storefrontProductSchema = productSchema
  .pick({
    id: true,
    name: true,
    slug: true,
    description: true,
  })
  .extend({
    brandName: z.string().nullable(),
    categoryName: z.string().nullable(),
    /** Cheapest active offer, the price a listing leads with. */
    fromPrice: moneySchema,
    offerCount: z.int().min(1),
    offers: z.array(storefrontOfferSchema),
  });
export type StorefrontProduct = z.infer<typeof storefrontProductSchema>;

export const storefrontListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  condition: offerConditionSchema.optional(),
});
export type StorefrontListQuery = z.infer<typeof storefrontListQuerySchema>;
