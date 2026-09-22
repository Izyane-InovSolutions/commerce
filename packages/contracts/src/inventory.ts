import { z } from 'zod';

import { listQuerySchema } from './common.ts';

/**
 * Inventory contract.
 *
 * `available` is derived by the API as `onHand - reserved`; a client displays
 * it and never computes it. Adjustments are submitted as a signed delta with a
 * reason so the API can keep the movement auditable, rather than as a new
 * absolute figure that would silently clobber a concurrent change.
 */

export const inventoryLocationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  /**
   * The seller who holds stock at this location, or null for a platform
   * fulfilment centre.
   *
   * Stock is owned by whoever holds it. This is what lets a seller manage
   * their own quantities without being able to touch platform warehouses.
   */
  sellerId: z.uuid().nullable(),
});
export type InventoryLocation = z.infer<typeof inventoryLocationSchema>;

export const inventoryLevelSchema = z.object({
  skuId: z.uuid(),
  skuCode: z.string(),
  productId: z.uuid(),
  productName: z.string(),
  variantName: z.string(),
  locationId: z.uuid(),
  locationName: z.string(),
  /** Null when the stock sits at a platform fulfilment centre. */
  locationSellerId: z.uuid().nullable(),
  onHand: z.int().min(0),
  reserved: z.int().min(0),
  available: z.int(),
  damaged: z.int().min(0),
  inTransit: z.int().min(0),
  reorderThreshold: z.int().min(0),
  updatedAt: z.iso.datetime(),
});
export type InventoryLevel = z.infer<typeof inventoryLevelSchema>;

export const inventoryListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().optional(),
  locationId: z.uuid().optional(),
  skuId: z.uuid().optional(),
  /** Restricts the listing to SKUs the given seller has an offer against. */
  sellerId: z.uuid().optional(),
  belowThreshold: z.stringbool().optional(),
});
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;

export const inventoryAdjustmentReasons = [
  'received',
  'cycle_count',
  'damaged',
  'returned',
  'correction',
] as const;
export const inventoryAdjustmentReasonSchema = z.enum(
  inventoryAdjustmentReasons,
);
export type InventoryAdjustmentReason = z.infer<
  typeof inventoryAdjustmentReasonSchema
>;

export const adjustInventorySchema = z.object({
  skuId: z.uuid(),
  locationId: z.uuid(),
  /** Signed change to on-hand stock. Negative removes stock. */
  delta: z.coerce
    .number()
    .int()
    .refine((value) => value !== 0, {
      message: 'Enter a non-zero adjustment.',
    }),
  reason: inventoryAdjustmentReasonSchema,
  note: z.string().trim().max(500).default(''),
});
export type AdjustInventoryInput = z.input<typeof adjustInventorySchema>;
