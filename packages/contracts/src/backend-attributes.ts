import { z } from 'zod';

/**
 * Catalog attributes — "Colour", "Size" — and the values a variant can carry.
 *
 * Attributes are platform-wide, like brands: a variant picks values from them
 * rather than typing its own, which is what lets the storefront filter by
 * them. The admin read of a product nests each variant's values with their
 * attribute, so a caller can label them without a second lookup.
 */

export const backendAttributeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BackendAttribute = z.infer<typeof backendAttributeSchema>;

export const backendAttributeValueSchema = z.object({
  id: z.uuid(),
  attributeId: z.uuid(),
  value: z.string(),
  createdAt: z.iso.datetime(),
});
export type BackendAttributeValue = z.infer<typeof backendAttributeValueSchema>;

/** The list and detail reads; create and update return the bare attribute. */
export const backendAttributeWithValuesSchema = backendAttributeSchema.extend({
  values: z.array(backendAttributeValueSchema).default([]),
});
export type BackendAttributeWithValues = z.infer<
  typeof backendAttributeWithValuesSchema
>;

/** One value on a variant, as the admin product read nests it. */
export const backendVariantAttributeValueSchema = z.object({
  variantId: z.uuid(),
  attributeValueId: z.uuid(),
  attributeValue: backendAttributeValueSchema.extend({
    attribute: backendAttributeSchema,
  }),
});
export type BackendVariantAttributeValue = z.infer<
  typeof backendVariantAttributeValueSchema
>;

/* ---- request payloads, matching the backend's DTOs exactly ---- */

const backendAttributeCode = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers, and single hyphens (e.g. "color").',
  );

export const backendCreateAttributeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  code: backendAttributeCode,
});
export type BackendCreateAttributeInput = z.input<
  typeof backendCreateAttributeSchema
>;

export const backendUpdateAttributeSchema =
  backendCreateAttributeSchema.partial();
export type BackendUpdateAttributeInput = z.input<
  typeof backendUpdateAttributeSchema
>;

/** Adding and renaming a value take the same body. */
export const backendAttributeValueInputSchema = z.object({
  value: z.string().trim().min(1, 'Value is required.'),
});
export type BackendAttributeValueInput = z.input<
  typeof backendAttributeValueInputSchema
>;

/**
 * `PATCH …/variants/:variantId`. Every field is optional; `attributeValueIds`,
 * when sent, *replaces* the variant's values outright — an empty array clears
 * them, and leaving it out keeps them as they are.
 */
export const backendUpdateVariantSchema = z.object({
  skuCode: z.string().trim().min(1, 'SKU code is required.').optional(),
  name: z.string().trim().optional(),
  attributeValueIds: z.array(z.uuid()).optional(),
});
export type BackendUpdateVariantInput = z.input<
  typeof backendUpdateVariantSchema
>;
