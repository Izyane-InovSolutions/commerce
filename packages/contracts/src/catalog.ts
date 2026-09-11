import { z } from 'zod';

import { listQuerySchema } from './common.ts';

/**
 * Catalog contract.
 *
 * Products describe *what an item is* and are owned by the platform. Who sells
 * one, and on what terms, is an Offer — see `./offers`.
 */

export const productStatuses = [
  'draft',
  'pending',
  'active',
  'rejected',
  'archived',
] as const;
export const productStatusSchema = z.enum(productStatuses);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const slugSchema = z
  .string()
  .min(1, 'Slug is required.')
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers, and single hyphens.',
  );

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  parentId: z.uuid().nullable(),
  /** Products filed directly under this category. Derived by the API. */
  productCount: z.int().min(0),
});
export type Category = z.infer<typeof categorySchema>;

export const brandSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  /** Products carrying this brand. Derived by the API. */
  productCount: z.int().min(0),
});
export type Brand = z.infer<typeof brandSchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  slug: slugSchema,
  /** Parent category, or null for a top-level one. */
  parentId: z.uuid().nullable().default(null),
});
export type CreateCategoryInput = z.input<typeof createCategorySchema>;

/**
 * A partial update to a category.
 *
 * `parentId` is re-declared as plainly optional: `.partial()` keeps a field's
 * default, so without this an update that never mentioned the parent would
 * arrive carrying `null` and silently move the category to the top level.
 */
export const updateCategorySchema = createCategorySchema.partial().extend({
  parentId: z.uuid().nullable().optional(),
});
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;

export const createBrandSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  slug: slugSchema,
});
export type CreateBrandInput = z.input<typeof createBrandSchema>;

export const updateBrandSchema = createBrandSchema.partial();
export type UpdateBrandInput = z.input<typeof updateBrandSchema>;

/** The stock-keeping unit an offer and an inventory level both point at. */
export const skuSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid(),
  code: z.string(),
});
export type Sku = z.infer<typeof skuSchema>;

export const productVariantSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  name: z.string(),
  attributes: z.record(z.string(), z.string()),
  sku: skuSchema,
});
export type ProductVariant = z.infer<typeof productVariantSchema>;

export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  status: productStatusSchema,
  brandId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  /**
   * A brand or category the seller named but which does not exist yet.
   *
   * Captured at the point the seller knows it, rather than making them stop
   * and ask an admin. An admin resolves it during review — attaching an
   * existing entry, creating the new one, or dismissing it.
   */
  proposedBrandName: z.string().nullable(),
  proposedCategoryName: z.string().nullable(),
  /** Set when a seller submitted the product rather than the platform. */
  submittedBySellerId: z.uuid().nullable(),
  submittedBySellerName: z.string().nullable(),
  /** Why an admin rejected the submission, shown back to the seller. */
  rejectionReason: z.string().nullable(),
  variants: z.array(productVariantSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Product = z.infer<typeof productSchema>;

/** A SKU flattened with its product context, for pickers and stock tables. */
export const skuSummarySchema = z.object({
  skuId: z.uuid(),
  skuCode: z.string(),
  productId: z.uuid(),
  productName: z.string(),
  variantName: z.string(),
  brandName: z.string().nullable(),
});
export type SkuSummary = z.infer<typeof skuSummarySchema>;

export const productListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().optional(),
  status: productStatusSchema.optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  /** Restricts the listing to products submitted by the given seller. */
  submittedBySellerId: z.uuid().optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const skuListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().optional(),
});
export type SkuListQuery = z.infer<typeof skuListQuerySchema>;

const variantInputSchema = z.object({
  name: z.string().trim().min(1, 'Variant name is required.').max(120),
  skuCode: z
    .string()
    .trim()
    .min(1, 'SKU code is required.')
    .max(64)
    .regex(
      /^[A-Z0-9][A-Z0-9-]*$/,
      'Use uppercase letters, numbers, and hyphens.',
    ),
  attributes: z.record(z.string(), z.string()).default({}),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  slug: slugSchema,
  description: z.string().trim().max(5000).default(''),
  status: productStatusSchema.default('draft'),
  brandId: z.uuid().nullable().default(null),
  categoryId: z.uuid().nullable().default(null),
  variants: z
    .array(variantInputSchema)
    .min(1, 'A product needs at least one variant.')
    .max(50),
});
export type CreateProductInput = z.input<typeof createProductSchema>;

/**
 * A partial update to a product.
 *
 * `.partial()` alone is not enough: it makes a field optional but *keeps its
 * default*, so a request that mentioned only the status would arrive with
 * `description: ''` and wipe the copy. Every defaulted field is re-declared as
 * plainly optional so an absent field stays absent.
 */
export const updateProductSchema = createProductSchema.partial().extend({
  description: z.string().trim().max(5000).optional(),
  status: productStatusSchema.optional(),
  brandId: z.uuid().nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
});
export type UpdateProductInput = z.input<typeof updateProductSchema>;

/** The only states a seller may put their own submission into. */
export const sellerProductStatuses = ['draft', 'pending'] as const;
export const sellerProductStatusSchema = z.enum(sellerProductStatuses);
export type SellerProductStatus = z.infer<typeof sellerProductStatusSchema>;

/**
 * What a seller submits to have a product added to the shared catalog.
 *
 * A seller may keep it as a `draft` or send it for review as `pending`, and
 * nothing else — they cannot publish straight to the storefront.
 */
const proposedNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(120)
  .nullable()
  .default(null);

export const submitProductSchema = createProductSchema
  .omit({ status: true })
  .extend({
    status: sellerProductStatusSchema.default('pending'),
    /** A brand the seller says exists but the catalog does not have. */
    proposedBrandName: proposedNameSchema,
    /** A category the seller needs but the catalog does not have. */
    proposedCategoryName: proposedNameSchema,
  })
  .refine(
    (value) => !(value.brandId !== null && value.proposedBrandName !== null),
    {
      message: 'Choose an existing brand or propose a new one, not both.',
      path: ['proposedBrandName'],
    },
  )
  .refine(
    (value) =>
      !(value.categoryId !== null && value.proposedCategoryName !== null),
    {
      message: 'Choose an existing category or propose a new one, not both.',
      path: ['proposedCategoryName'],
    },
  );
export type SubmitProductInput = z.input<typeof submitProductSchema>;

/**
 * Changes a seller may make to their own submission.
 *
 * Allowed only while the product is a draft, awaiting review, or rejected —
 * once it is live the platform owns it and edits go through an admin.
 */
/**
 * The seller-editable fields, without the cross-field checks.
 *
 * `.partial()` cannot be applied to a schema carrying refinements, so the
 * update schema is built from the plain object and the two "id or proposal,
 * not both" checks are re-attached afterwards.
 */
const sellerProductFieldsSchema = createProductSchema
  .omit({ status: true })
  .extend({
    status: sellerProductStatusSchema.default('pending'),
    proposedBrandName: proposedNameSchema,
    proposedCategoryName: proposedNameSchema,
  });

export const updateSellerProductSchema = sellerProductFieldsSchema
  .partial()
  .extend({
    description: z.string().trim().max(5000).optional(),
    // Optional with no default: editing a draft must not submit it for review
    // as a side effect.
    status: sellerProductStatusSchema.optional(),
    brandId: z.uuid().nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    proposedBrandName: z.string().trim().max(120).nullable().optional(),
    proposedCategoryName: z.string().trim().max(120).nullable().optional(),
  })
  .refine((value) => !(value.brandId && value.proposedBrandName), {
    message: 'Choose an existing brand or propose a new one, not both.',
    path: ['proposedBrandName'],
  })
  .refine((value) => !(value.categoryId && value.proposedCategoryName), {
    message: 'Choose an existing category or propose a new one, not both.',
    path: ['proposedCategoryName'],
  });
export type UpdateSellerProductInput = z.input<
  typeof updateSellerProductSchema
>;

/**
 * How an admin settles a proposed brand or category during review.
 *
 * `attach` maps the proposal onto an entry that already exists, which is the
 * common case — a seller naming "Northwind Furniture" when "Northwind" is
 * already there. `create` adds it to the shared taxonomy. `dismiss` publishes
 * the product without one.
 */
export const resolveProposalSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('attach'), id: z.uuid() }),
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(1, 'Name is required.').max(120),
    slug: slugSchema,
    /** Only meaningful for a category. */
    parentId: z.uuid().nullable().default(null),
  }),
  z.object({ action: z.literal('dismiss') }),
]);
export type ResolveProposalInput = z.input<typeof resolveProposalSchema>;
