import { z } from 'zod';
import { backendRatingSummarySchema } from './reviews.ts';

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
  isReturnable: z.boolean(),
  returnWindowDays: z.int().nullable(),
  /** Resolved in the requested currency; null when it has no price in it. */
  currentPrice: backendMoneySchema.nullable(),
  /** Every currency this offer currently carries a price in. */
  currencies: z.array(z.string()).default([]),
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
  /**
   * A flat, informational shipping cost shown on the storefront — separate
   * from the dynamic per-destination quote computed at checkout. The admin
   * read hands back the raw offer row, so this is two plain columns rather
   * than a nested `BackendMoney`; both are null until an admin sets one.
   */
  shippingAmount: z.int().nullable().default(null),
  shippingCurrency: z.string().nullable().default(null),
});
export type BackendAdminOffer = z.infer<typeof backendAdminOfferSchema>;

/**
 * The currencies the platform prices and settles in.
 *
 * Mirrors `SUPPORTED_CURRENCIES` in the API — Kwacha only.
 */
export const backendCurrencies = ['ZMW'] as const;
export const backendCurrencySchema = z.enum(backendCurrencies);
export type BackendCurrency = z.infer<typeof backendCurrencySchema>;

export const defaultBackendCurrency: BackendCurrency = 'ZMW';

function isCurrent(price: BackendPrice, at: Date): boolean {
  const starts = new Date(price.startsAt);
  const ends = price.endsAt === null ? null : new Date(price.endsAt);
  return starts <= at && (ends === null || ends > at);
}

function newestFirst(left: BackendPrice, right: BackendPrice): number {
  return new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime();
}

/**
 * The price in force for one currency, mirroring how the API resolves it.
 *
 * Currency is required: an offer may carry prices in several currencies at
 * once, and choosing between them by start date alone would hand back
 * whichever was edited last rather than the one asked for.
 */
export function pickCurrentPrice(
  prices: BackendPrice[],
  currency: string,
  at: Date = new Date(),
): BackendPrice | undefined {
  return prices
    .filter((price) => price.currency === currency && isCurrent(price, at))
    .sort(newestFirst)[0];
}

/**
 * The price in force in every currency the offer is priced in.
 *
 * For callers asking "is this priced at all?" rather than "what does it cost
 * in Kwacha?" — a listing needs one currency to have a price, not a
 * particular one.
 */
export function currentPrices(
  prices: BackendPrice[],
  at: Date = new Date(),
): BackendPrice[] {
  const byCurrency = new Map<string, BackendPrice>();

  for (const price of prices.filter((price) => isCurrent(price, at))) {
    const held = byCurrency.get(price.currency);
    if (!held || newestFirst(price, held) < 0) {
      byCurrency.set(price.currency, price);
    }
  }

  return [...byCurrency.values()];
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
export const backendRatedProductSchema = backendProductSchema.extend(
  backendRatingSummarySchema.shape,
);
export type BackendRatedProduct = z.infer<typeof backendRatedProductSchema>;

export const backendAdminProductSchema = backendProductSchema.extend({
  /** The admin read carries the asset itself, including ones still uploading. */
  media: z.array(backendProductMediaSchema).default([]),
  variants: z.array(backendAdminVariantSchema).default([]),
});
export type BackendAdminProduct = z.infer<typeof backendAdminProductSchema>;

export const backendProductSubmissionStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
] as const;
export const backendProductSubmissionStatusSchema = z.enum(
  backendProductSubmissionStatuses,
);
export type BackendProductSubmissionStatus = z.infer<
  typeof backendProductSubmissionStatusSchema
>;

/**
 * A product as a seller (their own) or admin (the review queue) sees it —
 * the same admin read shape, plus who submitted it and where that review
 * stands. `createdBySellerId` is null for an ordinary platform product,
 * which is never returned by the seller-scoped endpoints anyway.
 */
export const backendProductSubmissionSchema = backendAdminProductSchema.extend({
  // Present on every product (Prisma's own scalar columns), but never
  // needed by the admin/public reads this schema otherwise shares —
  // reviewing a submission is the one place a return policy matters yet.
  isReturnable: z.boolean(),
  returnWindowDays: z.int().nullable(),
  createdBySellerId: z.uuid().nullable(),
  submissionStatus: backendProductSubmissionStatusSchema,
  reviewReason: z.string().nullable(),
  reviewedBy: z.uuid().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
});
export type BackendProductSubmission = z.infer<
  typeof backendProductSubmissionSchema
>;

/** Required whichever way it goes, approving or rejecting — always a
 * record of why. No `version`: Product carries no such column, unlike
 * Seller; the review call itself is the atomic guard. */
export const backendReviewProductSubmissionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Enter at least a few words.')
    .max(1000, 'Keep it under 1000 characters.'),
});
export type BackendReviewProductSubmissionInput = z.input<
  typeof backendReviewProductSubmissionSchema
>;

export const backendAttachProductMediaSchema = z.object({
  mediaAssetId: z.uuid(),
  position: z.int().min(0).optional(),
  isPrimary: z.boolean().optional(),
});
export type BackendAttachProductMediaInput = z.input<
  typeof backendAttachProductMediaSchema
>;

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
  reorderPoint: z.int(),
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
  isReturnable: z.boolean().optional(),
  returnWindowDays: z.int().min(0).optional(),
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

/** `amount: null` clears the offer's shipping cost. */
export const backendUpdateOfferShippingSchema = z.object({
  amount: z.int().min(0).nullable(),
  currency: z.string().length(3).optional(),
});
export type BackendUpdateOfferShippingInput = z.input<
  typeof backendUpdateOfferShippingSchema
>;

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

/** A seller application, as `POST /sellers/applications` and `POST /sellers/me/resubmit` both take it. */
export const backendSellerApplicationSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'Give the business a name.')
    .max(200, 'Keep the business name under 200 characters.'),
  registrationNumber: z
    .string()
    .trim()
    .min(2, 'Enter a registration number.')
    .max(100, 'Keep the registration number under 100 characters.'),
  country: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code, such as ZM.'),
  businessAddress: z
    .string()
    .trim()
    .min(5, 'Enter the business address.')
    .max(1000, 'Keep the address under 1000 characters.'),
  contactEmail: z.email('Enter a valid contact email address.'),
  documentIds: z
    .array(z.uuid())
    .min(1, 'Upload at least one verification document.')
    .max(10, 'Upload at most 10 verification documents.'),
});
export type BackendSellerApplicationInput = z.input<
  typeof backendSellerApplicationSchema
>;

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

/**
 * A seller's own stock for one self-managed (`stockSource: 'SELLER'`) offer.
 * `id` and `updatedAt` are null until they set a quantity for the first
 * time — there is nothing to count yet, not zero stock specifically.
 */
export const backendSellerInventoryRecordSchema = z.object({
  id: z.uuid().nullable(),
  offerId: z.uuid(),
  variantId: z.uuid(),
  sellerSku: z.string().nullable(),
  listingTitle: z.string().nullable(),
  onHand: z.int(),
  reserved: z.int(),
  available: z.int(),
  version: z.int(),
  updatedAt: z.iso.datetime().nullable(),
});
export type BackendSellerInventoryRecord = z.infer<
  typeof backendSellerInventoryRecordSchema
>;

/** Sets the absolute on-hand quantity — `version` is the record's own
 * (0 before it exists yet), and the API rejects a stale one. */
export const backendSetSellerInventorySchema = z.object({
  quantity: z.int().min(0, 'Enter a quantity of 0 or more.'),
  version: z.int().min(0),
  note: z.string().trim().max(500).optional(),
});
export type BackendSetSellerInventoryInput = z.input<
  typeof backendSetSellerInventorySchema
>;

export const backendBulkSellerInventoryItemSchema =
  backendSetSellerInventorySchema.extend({
    offerId: z.uuid(),
  });
export const backendBulkSellerInventorySchema = z.object({
  items: z
    .array(backendBulkSellerInventoryItemSchema)
    .min(1, 'List at least one item.')
    .max(100, 'Update at most 100 items at once.'),
});
export type BackendBulkSellerInventoryInput = z.input<
  typeof backendBulkSellerInventorySchema
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

/* ---- returns and retail operations (#30) ---- */

export const backendReturnStatuses = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'RECEIVING',
  'RECEIVED',
  'INSPECTING',
  'CLOSED_NO_REFUND',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'REFUND_FAILED',
] as const;
export const backendReturnStatusSchema = z.enum(backendReturnStatuses);
export type BackendReturnStatus = z.infer<typeof backendReturnStatusSchema>;

export const backendReturnReasonCodes = [
  'CUSTOMER_REMORSE',
  'WRONG_ITEM',
  'DAMAGED',
  'DEFECTIVE',
  'NOT_AS_DESCRIBED',
  'SIZE_FIT',
  'OTHER',
] as const;
export const backendReturnReasonCodeSchema = z.enum(backendReturnReasonCodes);
export type BackendReturnReasonCode = z.infer<
  typeof backendReturnReasonCodeSchema
>;

export const backendReturnDispositions = [
  'RESTOCK',
  'QUARANTINE',
  'DAMAGED',
  'DISPOSE',
] as const;
export const backendReturnDispositionSchema = z.enum(backendReturnDispositions);
export type BackendReturnDisposition = z.infer<
  typeof backendReturnDispositionSchema
>;

export const backendReturnItemSchema = z.object({
  id: z.uuid(),
  returnRequestId: z.uuid(),
  orderItemId: z.uuid(),
  quantity: z.int(),
  reasonCode: backendReturnReasonCodeSchema,
  note: z.string().nullable(),
  unitAmount: z.int(),
  currency: z.string(),
  returnWindowDays: z.int(),
  eligibleUntil: z.iso.datetime(),
  deliveredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type BackendReturnItem = z.infer<typeof backendReturnItemSchema>;

export const backendRefundCaseSchema = z.object({
  id: z.uuid(),
  sellerOrderId: z.uuid(),
  returnRequestId: z.uuid().nullable(),
  source: z.enum(['RETURN', 'FULFILLMENT_CANCELLATION', 'ADMIN']),
  status: z.enum([
    'PENDING',
    'PROCESSING',
    'SUCCEEDED',
    'PARTIALLY_SUCCEEDED',
    'FAILED',
    'RECONCILIATION_REQUIRED',
    'CANCELLED',
  ]),
  amount: z.int(),
  shippingAmount: z.int(),
  currency: z.string(),
  reason: z.string(),
  version: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BackendRefundCase = z.infer<typeof backendRefundCaseSchema>;

export const backendReturnRequestSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  userId: z.uuid(),
  status: backendReturnStatusSchema,
  warehouseId: z.uuid().nullable(),
  assignedStaffId: z.uuid().nullable(),
  rmaNumber: z.string().nullable(),
  rmaInstructions: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  version: z.int(),
  items: z.array(backendReturnItemSchema).default([]),
  refundCases: z.array(backendRefundCaseSchema).default([]),
  receipts: z.array(z.unknown()).default([]),
  inspections: z.array(z.unknown()).default([]),
  events: z.array(z.unknown()).default([]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BackendReturnRequest = z.infer<typeof backendReturnRequestSchema>;

export const backendReturnEligibilitySchema = z.object({
  orderItemId: z.uuid(),
  returnable: z.boolean(),
  reason: z.string().optional(),
  returnWindowDays: z.int(),
  totalRemainingQuantity: z.int(),
  chunks: z.array(
    z.object({
      shipmentLineId: z.uuid(),
      deliveredAt: z.iso.datetime(),
      eligibleUntil: z.iso.datetime(),
      remainingQuantity: z.int(),
    }),
  ),
});
export type BackendReturnEligibility = z.infer<
  typeof backendReturnEligibilitySchema
>;

export type BackendCreateReturnInput = {
  items: {
    orderItemId: string;
    quantity: number;
    reasonCode: BackendReturnReasonCode;
    note?: string;
  }[];
};
export type BackendApproveReturnInput = {
  warehouseId: string;
  assignedStaffId?: string;
  version: number;
};
export type BackendRejectReturnInput = {
  rejectionReason: string;
  version: number;
};
export type BackendPostReturnReceiptInput = {
  warehouseId: string;
  lines: { returnItemId: string; quantity: number }[];
  isClosing?: boolean;
};
export type BackendPostReturnInspectionInput = {
  lines: {
    returnItemId: string;
    warehouseId: string;
    acceptedQuantity: number;
    disposition?: BackendReturnDisposition;
    rejectedQuantity: number;
    rejectionReason?: string;
  }[];
  isFinal?: boolean;
  shippingRefunds?: { sellerOrderId: string; amount: number }[];
};

export type BackendOperationsMetrics = {
  range: { from: string; to: string };
  sales: {
    paidOrderCount: number;
    grossSales: number;
    itemRefunds: number;
    shippingRefunds: number;
    netSales: number;
  };
  ordersByStatus: { status: string; count: number }[];
  fulfillment: {
    backlogCount: number;
    statusTotals: { status: string; count: number }[];
    aging: { averageAgeHours: number | null; maxAgeHours: number | null };
  };
  inventory: {
    onHand: number;
    reserved: number;
    available: number;
    outOfStockCount: number;
    lowStockCount: number;
  };
  returns: {
    countsByStatus: { status: BackendReturnStatus; count: number }[];
    countsByReasonCode: {
      reasonCode: BackendReturnReasonCode;
      count: number;
    }[];
    returnedQuantity: number;
    refundValue: number;
    returnRate: number | null;
    processingAgeHours: {
      openAverageAgeHours: number | null;
      closedAverageAgeHours: number | null;
    };
  };
};

/* ---- admin order management, fulfillment, and shipping ---- */

/** The admin read of a customer order — every seller's slice, unabridged. */
export const backendAdminOrderSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  status: backendOrderStatusSchema,
  currency: z.string(),
  subtotal: z.int(),
  shippingAmount: z.int(),
  total: z.int(),
  createdAt: z.iso.datetime(),
  items: z.array(backendOrderItemSchema).default([]),
  sellerOrders: z.array(backendSellerOrderSchema).default([]),
  payment: z
    .object({
      id: z.uuid(),
      status: z.string(),
      failureReason: z.string().nullable(),
    })
    .nullable()
    .optional(),
});
export type BackendAdminOrder = z.infer<typeof backendAdminOrderSchema>;

/**
 * Warehouse progress on one (shipping group, warehouse) pair of an order —
 * the unit picking, packing, and dispatch actually operate on. An order with
 * items from more than one seller, or split across fulfillment modes, has
 * more than one of these.
 */
export const backendFulfillmentStatuses = [
  'AWAITING_ACCEPTANCE',
  'READY_TO_PICK',
  'PICKING',
  'PARTIALLY_PICKED',
  'PICKED',
  'PACKING',
  'PARTIALLY_PACKED',
  'PACKED',
  'PARTIALLY_DISPATCHED',
  'DISPATCHED',
  'ON_HOLD',
  'PARTIALLY_CANCELLED',
  'CANCELLED',
] as const;
export const backendFulfillmentStatusSchema = z.enum(
  backendFulfillmentStatuses,
);
export type BackendFulfillmentStatus = z.infer<
  typeof backendFulfillmentStatusSchema
>;

/** One order item's quantity as it moves through picking, packing, and dispatch. */
export const backendFulfillmentLineSchema = z.object({
  id: z.uuid(),
  fulfillmentOrderId: z.uuid(),
  orderItemId: z.uuid(),
  variantId: z.uuid(),
  allocatedQuantity: z.int(),
  pickedQuantity: z.int(),
  packedQuantity: z.int(),
  shipmentAssignedQuantity: z.int(),
  dispatchedQuantity: z.int(),
  cancelledQuantity: z.int(),
});
export type BackendFulfillmentLine = z.infer<
  typeof backendFulfillmentLineSchema
>;

export const backendFulfillmentWorkItemTypes = ['PICK', 'PACK'] as const;
export const backendFulfillmentWorkItemTypeSchema = z.enum(
  backendFulfillmentWorkItemTypes,
);
export type BackendFulfillmentWorkItemType = z.infer<
  typeof backendFulfillmentWorkItemTypeSchema
>;

export const backendFulfillmentWorkItemStatuses = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export const backendFulfillmentWorkItemSchema = z.object({
  id: z.uuid(),
  fulfillmentOrderId: z.uuid(),
  type: backendFulfillmentWorkItemTypeSchema,
  status: z.enum(backendFulfillmentWorkItemStatuses),
  assignedUserId: z.uuid().nullable(),
  version: z.int(),
});
export type BackendFulfillmentWorkItem = z.infer<
  typeof backendFulfillmentWorkItemSchema
>;

export const backendFulfillmentExceptionTypes = [
  'SHORT_PICK',
  'DAMAGED',
  'MISSING',
] as const;
export const backendFulfillmentExceptionStatuses = [
  'OPEN',
  'RESOLVED',
] as const;
export const backendFulfillmentExceptionSchema = z.object({
  id: z.uuid(),
  fulfillmentOrderId: z.uuid(),
  fulfillmentLineId: z.uuid(),
  type: z.enum(backendFulfillmentExceptionTypes),
  status: z.enum(backendFulfillmentExceptionStatuses),
  quantity: z.int(),
  reason: z.string(),
});
export type BackendFulfillmentException = z.infer<
  typeof backendFulfillmentExceptionSchema
>;

export const backendFulfillmentOrderSchema = z.object({
  id: z.uuid(),
  fulfillmentNumber: z.string(),
  orderId: z.uuid(),
  sellerOrderId: z.uuid(),
  shippingGroupId: z.uuid(),
  warehouseId: z.uuid(),
  status: backendFulfillmentStatusSchema,
  priority: z.int(),
  version: z.int(),
  heldReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lines: z.array(backendFulfillmentLineSchema).default([]),
  workItems: z.array(backendFulfillmentWorkItemSchema).default([]),
  exceptions: z.array(backendFulfillmentExceptionSchema).default([]),
});
export type BackendFulfillmentOrder = z.infer<
  typeof backendFulfillmentOrderSchema
>;

/** Every mutation below carries the version it was decided against, or an
 * idempotency key, or both — two staff acting on the same line cannot both
 * silently succeed, and a retried request cannot double-apply. */
export const backendVersionInputSchema = z.object({
  version: z.int().min(0),
});
export type BackendVersionInput = z.input<typeof backendVersionInputSchema>;

export const backendQuantityLineSchema = z.object({
  fulfillmentLineId: z.uuid(),
  quantity: z.int().min(1),
});
export type BackendQuantityLine = z.input<typeof backendQuantityLineSchema>;

export const backendRecordQuantitiesInputSchema = z.object({
  lines: z.array(backendQuantityLineSchema).min(1),
});
export type BackendRecordQuantitiesInput = z.input<
  typeof backendRecordQuantitiesInputSchema
>;

export const backendDispatchInputSchema = z.object({
  shipmentId: z.uuid(),
});
export type BackendDispatchInput = z.input<typeof backendDispatchInputSchema>;

export const backendFulfillmentDispatchLineSchema = z.object({
  id: z.uuid(),
  fulfillmentDispatchId: z.uuid(),
  fulfillmentLineId: z.uuid(),
  quantity: z.int(),
});
export const backendFulfillmentDispatchSchema = z.object({
  id: z.uuid(),
  fulfillmentOrderId: z.uuid(),
  shipmentId: z.uuid(),
  idempotencyKey: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
  lines: z.array(backendFulfillmentDispatchLineSchema).default([]),
});
export type BackendFulfillmentDispatch = z.infer<
  typeof backendFulfillmentDispatchSchema
>;

/**
 * A shipment is booked against already-packed quantity before it can be
 * dispatched — `PENDING_BOOKING` and `BOOKED` both precede
 * `FulfillmentOrder.status` ever reaching `DISPATCHED`.
 */
export const backendShipmentStatuses = [
  'PENDING_BOOKING',
  'BOOKED',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'EXCEPTION',
  'RETURN_TO_SENDER',
  'RETURNED',
  'CANCELLED',
] as const;
export const backendShipmentStatusSchema = z.enum(backendShipmentStatuses);
export type BackendShipmentStatus = z.infer<typeof backendShipmentStatusSchema>;

export const backendShipmentLineSchema = z.object({
  id: z.uuid(),
  shipmentId: z.uuid(),
  fulfillmentLineId: z.uuid(),
  orderItemId: z.uuid(),
  quantity: z.int(),
});
export type BackendShipmentLine = z.infer<typeof backendShipmentLineSchema>;

export const backendShipmentSchema = z.object({
  id: z.uuid(),
  shipmentNumber: z.string(),
  orderId: z.uuid(),
  sellerOrderId: z.uuid(),
  shippingGroupId: z.uuid(),
  fulfillmentOrderId: z.uuid(),
  warehouseId: z.uuid(),
  providerCode: z.string(),
  carrierCode: z.string(),
  methodCode: z.string(),
  trackingReference: z.string().nullable(),
  status: backendShipmentStatusSchema,
  estimatedDeliveryAt: z.iso.datetime().nullable(),
  bookedAt: z.iso.datetime().nullable(),
  dispatchedAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  lines: z.array(backendShipmentLineSchema).default([]),
});
export type BackendShipment = z.infer<typeof backendShipmentSchema>;

export const backendCreateShipmentInputSchema = z.object({
  fulfillmentOrderId: z.uuid(),
  lines: z.array(backendQuantityLineSchema).min(1),
});
export type BackendCreateShipmentInput = z.input<
  typeof backendCreateShipmentInputSchema
>;

/**
 * A manual tracking event — how staff record a carrier update by hand, and
 * the only way to correct a status that projected wrong (`isCorrection`,
 * admin-only server-side). `normalizedStatus` accepts any shipment status,
 * including regressions and terminal ones like `DELIVERED`.
 */
export const backendAddTrackingEventInputSchema = z.object({
  normalizedStatus: backendShipmentStatusSchema,
  description: z.string().optional(),
  location: z.string().optional(),
  occurredAt: z.iso.datetime().optional(),
  isCorrection: z.boolean().optional(),
  correctionReason: z.string().min(1).optional(),
});
export type BackendAddTrackingEventInput = z.input<
  typeof backendAddTrackingEventInputSchema
>;

export const backendTrackingEventSchema = z.object({
  id: z.uuid(),
  shipmentId: z.uuid(),
  normalizedStatus: backendShipmentStatusSchema,
  description: z.string().nullable(),
  location: z.string().nullable(),
  occurredAt: z.iso.datetime(),
  isCorrection: z.boolean(),
  correctionReason: z.string().nullable(),
});
export type BackendTrackingEvent = z.infer<typeof backendTrackingEventSchema>;
