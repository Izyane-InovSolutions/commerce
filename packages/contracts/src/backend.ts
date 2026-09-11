import { z } from 'zod';

/**
 * The Commerce API as it actually exists today (Phase 0–2).
 *
 * Kept separate from the rest of this package, which describes the Phase 3
 * marketplace the clients were built against. Where the two disagree the
 * backend wins, and the difference is documented here rather than hidden in a
 * mapping function.
 */

/** Every response is wrapped. Lists wrap a second time around their page. */
export type Envelope<T> = { data: T; meta: { requestId: string } };

export const backendPageMetaSchema = z.object({
  page: z.int(),
  limit: z.int(),
  total: z.int(),
});
export type BackendPageMeta = z.infer<typeof backendPageMetaSchema>;

export type BackendPage<T> = { data: T[]; meta: BackendPageMeta };

/** Money is `amount` in minor units, not `amountMinor`. */
export const backendMoneySchema = z.object({
  amount: z.int(),
  currency: z.string(),
});
export type BackendMoney = z.infer<typeof backendMoneySchema>;

/** A single role string, not the array the marketplace contract assumes. */
export const backendRoles = ['CUSTOMER', 'SELLER', 'STAFF', 'ADMIN'] as const;
export const backendRoleSchema = z.enum(backendRoles);
export type BackendRole = z.infer<typeof backendRoleSchema>;

export const backendUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: backendRoleSchema,
});
export type BackendUser = z.infer<typeof backendUserSchema>;

export const backendSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string(),
  expiresIn: z.int(),
  user: backendUserSchema,
});
export type BackendSession = z.infer<typeof backendSessionSchema>;

export const backendCredentialsSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type BackendCredentials = z.input<typeof backendCredentialsSchema>;

/** Three states, not the five the moderation flow assumes. */
export const backendProductStatuses = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export const backendProductStatusSchema = z.enum(backendProductStatuses);
export type BackendProductStatus = z.infer<typeof backendProductStatusSchema>;

export const backendCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  parentId: z.uuid().nullable(),
  position: z.int(),
});
export type BackendCategory = z.infer<typeof backendCategorySchema>;

export const backendBrandSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
});
export type BackendBrand = z.infer<typeof backendBrandSchema>;

/**
 * An offer as the *public* catalog returns it, with the applicable price
 * already resolved.
 */
export const backendOfferSchema = z.object({
  id: z.uuid(),
  status: backendProductStatusSchema,
  currentPrice: backendMoneySchema.nullable(),
});
export type BackendOffer = z.infer<typeof backendOfferSchema>;

export const backendPriceSchema = z.object({
  id: z.uuid(),
  amount: z.int(),
  currency: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
});
export type BackendPrice = z.infer<typeof backendPriceSchema>;

/**
 * An offer as the *admin* catalog returns it.
 *
 * The admin read hands back the whole price history rather than the resolved
 * one, so a caller that wants today's price picks it — the two endpoints are
 * not symmetrical.
 */
export const backendAdminOfferSchema = z.object({
  id: z.uuid(),
  sellerId: z.uuid().nullable(),
  status: backendProductStatusSchema,
  prices: z.array(backendPriceSchema).default([]),
});
export type BackendAdminOffer = z.infer<typeof backendAdminOfferSchema>;

/**
 * The price in force, mirroring how the API resolves it: the most recently
 * started price whose window covers now.
 */
export function pickCurrentPrice(
  prices: BackendPrice[],
  at: Date = new Date(),
): BackendPrice | undefined {
  return prices
    .filter((price) => {
      const starts = new Date(price.startsAt);
      const ends = price.endsAt === null ? null : new Date(price.endsAt);
      return starts <= at && (ends === null || ends > at);
    })
    .sort(
      (left, right) =>
        new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime(),
    )[0];
}

export const backendVariantSchema = z.object({
  id: z.uuid(),
  skuCode: z.string(),
  name: z.string().nullable(),
  status: backendProductStatusSchema,
  offers: z.array(backendOfferSchema).default([]),
});
export type BackendVariant = z.infer<typeof backendVariantSchema>;

export const backendAdminVariantSchema = backendVariantSchema.extend({
  offers: z.array(backendAdminOfferSchema).default([]),
});
export type BackendAdminVariant = z.infer<typeof backendAdminVariantSchema>;

export const backendProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: backendProductStatusSchema,
  brand: backendBrandSchema.nullable(),
  category: backendCategorySchema.nullable(),
  variants: z.array(backendVariantSchema).default([]),
});
export type BackendProduct = z.infer<typeof backendProductSchema>;

export const backendAdminProductSchema = backendProductSchema.extend({
  variants: z.array(backendAdminVariantSchema).default([]),
});
export type BackendAdminProduct = z.infer<typeof backendAdminProductSchema>;

export const backendWarehouseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  isActive: z.boolean(),
});
export type BackendWarehouse = z.infer<typeof backendWarehouseSchema>;

/** Keyed by variant and warehouse; carries no product or SKU names. */
export const backendInventoryRecordSchema = z.object({
  id: z.uuid(),
  warehouseId: z.uuid(),
  variantId: z.uuid(),
  onHand: z.int(),
  reserved: z.int(),
  available: z.int(),
  updatedAt: z.iso.datetime(),
});
export type BackendInventoryRecord = z.infer<
  typeof backendInventoryRecordSchema
>;

/* ---- request payloads, matching the backend's DTOs exactly ---- */

const backendSlug = z
  .string()
  .trim()
  .min(1, 'Slug is required.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers, and single hyphens.',
  );

export const backendCreateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  slug: backendSlug,
  description: z.string().trim().optional(),
  parentId: z.uuid().optional(),
});
export type BackendCreateCategoryInput = z.input<
  typeof backendCreateCategorySchema
>;

export const backendCreateBrandSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  slug: backendSlug,
  description: z.string().trim().optional(),
});
export type BackendCreateBrandInput = z.input<typeof backendCreateBrandSchema>;

export const backendCreateProductSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  slug: backendSlug,
  description: z.string().trim().optional(),
  brandId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
});
export type BackendCreateProductInput = z.input<
  typeof backendCreateProductSchema
>;

export const backendCreateVariantSchema = z.object({
  skuCode: z.string().trim().min(1, 'SKU code is required.'),
  name: z.string().trim().optional(),
});
export type BackendCreateVariantInput = z.input<
  typeof backendCreateVariantSchema
>;

export const backendCreatePriceSchema = z.object({
  amount: z.int().min(0),
  currency: z.string().length(3),
});
export type BackendCreatePriceInput = z.input<typeof backendCreatePriceSchema>;

export const backendStockMovementSchema = z.object({
  warehouseId: z.uuid(),
  variantId: z.uuid(),
  note: z.string().trim().optional(),
});

export function backendMoneyToMinor(value: BackendMoney): number {
  return value.amount;
}
