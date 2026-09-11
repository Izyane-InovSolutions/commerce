import { z } from 'zod';

import { listQuerySchema } from './common.ts';

/**
 * Seller account and onboarding contract.
 *
 * A shopper applies to sell; an admin approves. Approval is what creates the
 * seller account and grants the applicant the seller role — nothing a client
 * does can shortcut it.
 */

export const sellerStatuses = ['pending', 'approved', 'suspended'] as const;
export const sellerStatusSchema = z.enum(sellerStatuses);
export type SellerStatus = z.infer<typeof sellerStatusSchema>;

export const sellerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: sellerStatusSchema,
  /**
   * Absolute URL of the store's logo, or null.
   *
   * A seller without one is not a broken state — clients fall back to a
   * monogram built from the name, so a brand-new store still looks finished.
   */
  logoUrl: z.url().nullable(),
});
export type Seller = z.infer<typeof sellerSchema>;

export const applicationStatuses = ['pending', 'approved', 'rejected'] as const;
export const applicationStatusSchema = z.enum(applicationStatuses);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const sellerApplicationSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  userName: z.string(),
  userEmail: z.email(),
  displayName: z.string(),
  slug: z.string(),
  contactEmail: z.email(),
  description: z.string(),
  status: applicationStatusSchema,
  /** Set when an admin rejects, so the applicant is told why. */
  rejectionReason: z.string().nullable(),
  sellerId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});
export type SellerApplication = z.infer<typeof sellerApplicationSchema>;

export const createSellerApplicationSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Enter the name shoppers will see.')
    .max(120),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Use lowercase letters, numbers, and single hyphens.',
    ),
  contactEmail: z.email('Enter a valid contact email.'),
  description: z
    .string()
    .trim()
    .min(20, 'Tell us at least a sentence about what you sell.')
    .max(2000),
});
export type CreateSellerApplicationInput = z.input<
  typeof createSellerApplicationSchema
>;

export const rejectSchema = z.object({
  reason: z.string().trim().min(3, 'Give the applicant a reason.').max(500),
});
export type RejectInput = z.input<typeof rejectSchema>;

export const sellerApplicationListQuerySchema = listQuerySchema.extend({
  status: applicationStatusSchema.optional(),
});
export type SellerApplicationListQuery = z.infer<
  typeof sellerApplicationListQuerySchema
>;

export const sellerListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().optional(),
  status: sellerStatusSchema.optional(),
});
export type SellerListQuery = z.infer<typeof sellerListQuerySchema>;
