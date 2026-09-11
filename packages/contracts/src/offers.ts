import { z } from 'zod';

import { listQuerySchema, moneySchema } from './common.ts';

/**
 * Offer contract.
 *
 * An offer is a seller's commercial proposition against a catalog SKU. Sellers
 * own offers; they never own the product. Price is authoritative on the server,
 * so a client sends a proposed price and renders whatever comes back.
 */

export const offerConditions = ['new', 'refurbished', 'used'] as const;
export const offerConditionSchema = z.enum(offerConditions);
export type OfferCondition = z.infer<typeof offerConditionSchema>;

export const offerStatuses = ['draft', 'active', 'inactive'] as const;
export const offerStatusSchema = z.enum(offerStatuses);
export type OfferStatus = z.infer<typeof offerStatusSchema>;

export const fulfillmentModes = [
  'platform',
  'seller',
  'threepl',
  'pickup',
] as const;
export const fulfillmentModeSchema = z.enum(fulfillmentModes);
export type FulfillmentMode = z.infer<typeof fulfillmentModeSchema>;

export const offerSchema = z.object({
  id: z.uuid(),
  skuId: z.uuid(),
  skuCode: z.string(),
  productId: z.uuid(),
  productName: z.string(),
  variantName: z.string(),
  sellerId: z.uuid(),
  sellerName: z.string(),
  price: moneySchema,
  compareAtPrice: moneySchema.nullable(),
  condition: offerConditionSchema,
  status: offerStatusSchema,
  fulfillmentMode: fulfillmentModeSchema,
  handlingTimeDays: z.int().min(0).max(30),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Offer = z.infer<typeof offerSchema>;

export const offerListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().optional(),
  sellerId: z.uuid().optional(),
  skuId: z.uuid().optional(),
  status: offerStatusSchema.optional(),
});
export type OfferListQuery = z.infer<typeof offerListQuerySchema>;

const priceInputSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount such as 12.50.');

export const createOfferSchema = z.object({
  skuId: z.uuid('Choose a SKU to sell.'),
  price: priceInputSchema,
  compareAtPrice: priceInputSchema.or(z.literal('')).default(''),
  currency: z.string().length(3).default('GBP'),
  condition: offerConditionSchema.default('new'),
  status: offerStatusSchema.default('draft'),
  fulfillmentMode: fulfillmentModeSchema.default('seller'),
  handlingTimeDays: z.coerce.number().int().min(0).max(30).default(1),
});
export type CreateOfferInput = z.input<typeof createOfferSchema>;

export const updateOfferSchema = createOfferSchema.partial();
export type UpdateOfferInput = z.input<typeof updateOfferSchema>;
