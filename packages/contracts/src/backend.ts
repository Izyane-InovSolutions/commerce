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

/* ---- media ---- */

/** What the API accepts as an upload. Anything else is rejected on reserve. */
export const backendMediaTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const backendMediaTypeSchema = z.enum(backendMediaTypes);
export type BackendMediaType = z.infer<typeof backendMediaTypeSchema>;

export const backendMediaStatuses = [
  'PENDING_UPLOAD',
  'AVAILABLE',
  'DELETED',
] as const;
export const backendMediaStatusSchema = z.enum(backendMediaStatuses);
export type BackendMediaStatus = z.infer<typeof backendMediaStatusSchema>;

/**
 * A reservation, made before any bytes are sent.
 *
 * `byteSize` is checked against the file that follows, so it has to be the
 * real length rather than an estimate.
 */
export const backendReserveUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: backendMediaTypeSchema,
  byteSize: z.int().min(1),
});
export type BackendReserveUploadInput = z.input<
  typeof backendReserveUploadSchema
>;

/** A signed, time-limited URL, relative to the API's own origin. */
export const backendSignedUrlSchema = z.object({
  url: z.string(),
  expiresAt: z.iso.datetime(),
});
export type BackendSignedUrl = z.infer<typeof backendSignedUrlSchema>;

export const backendMediaAssetSchema = z.object({
  id: z.uuid(),
  originalFileName: z.string(),
  mimeType: z.string(),
  status: backendMediaStatusSchema,
});
export type BackendMediaAsset = z.infer<typeof backendMediaAssetSchema>;

export const backendMediaUploadSchema = z.object({
  asset: backendMediaAssetSchema,
  upload: backendSignedUrlSchema,
});
export type BackendMediaUpload = z.infer<typeof backendMediaUploadSchema>;

/** An image on a product, as the admin catalog returns it. */
export const backendProductMediaSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  mediaAssetId: z.uuid(),
  position: z.int(),
  isPrimary: z.boolean(),
  createdAt: z.iso.datetime(),
  mediaAsset: backendMediaAssetSchema,
  /** Signed and relative to the API's origin; null until the bytes land. */
  url: z.string().nullable(),
});
export type BackendProductMedia = z.infer<typeof backendProductMediaSchema>;

/**
 * An image as the *public* catalog returns it: already signed, so a client
 * can render it without asking the media module for anything.
 */
export const backendPublicProductMediaSchema = z.object({
  id: z.uuid(),
  mediaAssetId: z.uuid(),
  position: z.int(),
  isPrimary: z.boolean(),
  mimeType: z.string(),
  url: z.string(),
});
export type BackendPublicProductMedia = z.infer<
  typeof backendPublicProductMediaSchema
>;

/**
 * The image to lead with: whichever is marked primary, else the first by
 * position. Null when the product has no usable image.
 */
export function pickPrimaryMedia(
  media: BackendPublicProductMedia[],
): BackendPublicProductMedia | null {
  if (media.length === 0) {
    return null;
  }

  const ordered = [...media].sort(
    (left, right) => left.position - right.position,
  );
  return ordered.find((entry) => entry.isPrimary) ?? ordered[0] ?? null;
}

export const backendProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: backendProductStatusSchema,
  brand: backendBrandSchema.nullable(),
  category: backendCategorySchema.nullable(),
  /** Only assets that are uploaded and available; see `backendMediaStatuses`. */
  media: z.array(backendPublicProductMediaSchema).default([]),
  variants: z.array(backendVariantSchema).default([]),
});
export type BackendProduct = z.infer<typeof backendProductSchema>;

export const backendAdminProductSchema = backendProductSchema.extend({
  /** The admin read carries the asset itself, including ones still uploading. */
  media: z.array(backendProductMediaSchema).default([]),
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

/* ---- the marketplace domain, as the backend now exposes it ---- */

/**
 * The seller-scoped and admin-seller endpoints page differently from the
 * catalog: they return `{ items, total, page, limit }` flat, not the
 * `{ data, meta }` shape `BackendPage` describes. Two pagination conventions
 * live in this API at once, so callers need both.
 */
export type BackendItemsPage<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export const backendSellerStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;
export const backendSellerStatusSchema = z.enum(backendSellerStatuses);
export type BackendSellerStatus = z.infer<typeof backendSellerStatusSchema>;

/** What the admin *list* returns — five fields, not the whole seller. */
export const backendSellerSummarySchema = z.object({
  id: z.uuid(),
  businessName: z.string(),
  status: backendSellerStatusSchema,
  createdAt: z.iso.datetime(),
  version: z.int(),
});
export type BackendSellerSummary = z.infer<typeof backendSellerSummarySchema>;

export const backendSellerDocumentSchema = z.object({
  mediaAssetId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type BackendSellerDocument = z.infer<typeof backendSellerDocumentSchema>;

export const backendSellerDetailSchema = backendSellerSummarySchema.extend({
  ownerUserId: z.uuid(),
  registrationNumber: z.string(),
  country: z.string(),
  businessAddress: z.string(),
  contactEmail: z.string(),
  reviewReason: z.string().nullable(),
  reviewedBy: z.uuid().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  storefrontSlug: z.string().nullable(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  documents: z.array(backendSellerDocumentSchema).default([]),
  updatedAt: z.iso.datetime(),
});
export type BackendSellerDetail = z.infer<typeof backendSellerDetailSchema>;

export const backendOfferConditions = ['NEW', 'USED', 'REFURBISHED'] as const;
export const backendOfferConditionSchema = z.enum(backendOfferConditions);
export type BackendOfferCondition = z.infer<typeof backendOfferConditionSchema>;

/** Who holds the stock, and who ships it. Both default to the platform. */
export const backendOfferSources = ['PLATFORM', 'SELLER'] as const;
export const backendOfferSourceSchema = z.enum(backendOfferSources);
export type BackendOfferSource = z.infer<typeof backendOfferSourceSchema>;

/**
 * A seller's own offer. Like the admin read it carries the whole price
 * history rather than a resolved price, so `pickCurrentPrice` applies here
 * too. `version` is required on every write — the API rejects a stale one.
 */
export const backendSellerOfferSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid(),
  sellerId: z.uuid().nullable(),
  sellerSku: z.string().nullable(),
  listingTitle: z.string().nullable(),
  condition: backendOfferConditionSchema,
  stockSource: backendOfferSourceSchema,
  fulfillmentMode: backendOfferSourceSchema,
  version: z.int(),
  status: backendProductStatusSchema,
  prices: z.array(backendPriceSchema).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BackendSellerOffer = z.infer<typeof backendSellerOfferSchema>;

export const backendOrderStatuses = [
  'PENDING_PAYMENT',
  'PAID',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export const backendOrderStatusSchema = z.enum(backendOrderStatuses);
export type BackendOrderStatus = z.infer<typeof backendOrderStatusSchema>;

/** Amounts are minor units. A line names its offer, never its product. */
export const backendOrderItemSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  sellerOrderId: z.uuid().nullable(),
  offerId: z.uuid(),
  quantity: z.int(),
  unitAmount: z.int(),
  currency: z.string(),
  lineTotal: z.int(),
  createdAt: z.iso.datetime(),
});
export type BackendOrderItem = z.infer<typeof backendOrderItemSchema>;

/**
 * One seller's slice of a customer order. `sellerId: null` is the platform's
 * own group rather than "no seller"; every order has at least one.
 */
export const backendSellerOrderSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  sellerId: z.uuid().nullable(),
  status: backendOrderStatusSchema,
  subtotal: z.int(),
  total: z.int(),
  refundedAmount: z.int(),
  currency: z.string(),
  items: z.array(backendOrderItemSchema).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BackendSellerOrder = z.infer<typeof backendSellerOrderSchema>;

export const backendLedgerEntryTypes = ['SALE', 'REFUND', 'PAYOUT'] as const;
export const backendLedgerEntryTypeSchema = z.enum(backendLedgerEntryTypes);
export type BackendLedgerEntryType = z.infer<
  typeof backendLedgerEntryTypeSchema
>;

export const backendLedgerEntrySchema = z.object({
  id: z.uuid(),
  sellerId: z.uuid(),
  type: backendLedgerEntryTypeSchema,
  referenceType: z.string(),
  referenceId: z.string(),
  grossAmount: z.int(),
  commissionAmount: z.int(),
  netAmount: z.int(),
  currency: z.string(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type BackendLedgerEntry = z.infer<typeof backendLedgerEntrySchema>;

/** A running total kept in step with the ledger, not an independent source. */
export const backendSellerBalanceSchema = z.object({
  sellerId: z.uuid(),
  balance: z.int(),
  currency: z.string(),
});
export type BackendSellerBalance = z.infer<typeof backendSellerBalanceSchema>;

/** Bookkeeping only: "this seller was paid externally", not a payout rail. */
export const backendPayoutSchema = z.object({
  id: z.uuid(),
  sellerId: z.uuid(),
  amount: z.int(),
  currency: z.string(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type BackendPayout = z.infer<typeof backendPayoutSchema>;

/* ---- marketplace request payloads, matching the backend's DTOs ---- */

/** Every review carries the version it was decided against, and a reason. */
export const backendReviewSellerSchema = z.object({
  version: z.int().min(0),
  reason: z
    .string()
    .trim()
    .min(3, 'Give a reason of at least 3 characters.')
    .max(1000, 'Keep the reason under 1000 characters.'),
});
export type BackendReviewSellerInput = z.input<
  typeof backendReviewSellerSchema
>;

const backendSellerOfferDetails = {
  sellerSku: z
    .string()
    .trim()
    .min(1, 'SKU is required.')
    .max(100, 'Keep the SKU under 100 characters.'),
  listingTitle: z
    .string()
    .trim()
    .min(2, 'Give the listing a title of at least 2 characters.')
    .max(200, 'Keep the title under 200 characters.'),
  condition: backendOfferConditionSchema,
  stockSource: backendOfferSourceSchema,
  fulfillmentMode: backendOfferSourceSchema,
};

export const backendCreateSellerOfferSchema = z.object({
  ...backendSellerOfferDetails,
  variantId: z.uuid('Choose a variant to list against.'),
});
export type BackendCreateSellerOfferInput = z.input<
  typeof backendCreateSellerOfferSchema
>;

export const backendUpdateSellerOfferSchema = z.object({
  ...backendSellerOfferDetails,
  version: z.int().min(0),
});
export type BackendUpdateSellerOfferInput = z.input<
  typeof backendUpdateSellerOfferSchema
>;

export const backendSellerOfferStatusSchema = z.object({
  version: z.int().min(0),
  status: backendProductStatusSchema,
});
export type BackendSellerOfferStatusInput = z.input<
  typeof backendSellerOfferStatusSchema
>;

/** Amount is minor units, and must be at least 1 — the API rejects zero. */
export const backendSellerOfferPriceSchema = z.object({
  version: z.int().min(0),
  amount: z.int().min(1, 'Enter a price above zero.'),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, such as ZMW.'),
});
export type BackendSellerOfferPriceInput = z.input<
  typeof backendSellerOfferPriceSchema
>;

export const backendRecordPayoutSchema = z.object({
  amount: z.int().min(1, 'Enter an amount above zero.'),
  reference: z
    .string()
    .trim()
    .max(200, 'Keep the reference under 200 characters.')
    .optional(),
  note: z
    .string()
    .trim()
    .max(500, 'Keep the note under 500 characters.')
    .optional(),
});
export type BackendRecordPayoutInput = z.input<
  typeof backendRecordPayoutSchema
>;
