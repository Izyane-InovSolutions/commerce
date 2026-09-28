import { z } from 'zod';

/**
 * The history behind one stock record: every movement that changed its
 * counters, and every reservation held against it. Both come back as raw
 * rows, newest first, and neither is paged.
 */

export const backendInventoryMovementTypes = [
  'RECEIPT',
  'ADJUSTMENT',
  'RESERVATION',
  'RELEASE',
  'COMMITMENT',
  'RETURN',
] as const;
export const backendInventoryMovementTypeSchema = z.enum(
  backendInventoryMovementTypes,
);
export type BackendInventoryMovementType = z.infer<
  typeof backendInventoryMovementTypeSchema
>;

export const backendInventoryMovementSchema = z.object({
  id: z.uuid(),
  inventoryRecordId: z.uuid(),
  type: backendInventoryMovementTypeSchema,
  /** Signed for an adjustment; a plain count for everything else. */
  quantity: z.int(),
  /** What caused it — e.g. an order or a return — when anything did. */
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type BackendInventoryMovement = z.infer<
  typeof backendInventoryMovementSchema
>;

export const backendReservationStatuses = [
  'ACTIVE',
  'COMMITTED',
  'RELEASED',
  'EXPIRED',
] as const;
export const backendReservationStatusSchema = z.enum(
  backendReservationStatuses,
);
export type BackendReservationStatus = z.infer<
  typeof backendReservationStatusSchema
>;

export const backendReservationSchema = z.object({
  id: z.uuid(),
  inventoryRecordId: z.uuid(),
  quantity: z.int(),
  status: backendReservationStatusSchema,
  /** Who is holding it — a cart or a checkout — once one is recorded. */
  holderType: z.string().nullable(),
  holderId: z.string().nullable(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BackendReservation = z.infer<typeof backendReservationSchema>;

/** `PATCH /admin/inventory/warehouses/:id` — every field optional. */
export const backendUpdateWarehouseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').optional(),
  code: z
    .string()
    .trim()
    .regex(
      /^[A-Z0-9_-]+$/,
      'Use uppercase letters, digits, hyphens, or underscores.',
    )
    .optional(),
  isActive: z.boolean().optional(),
});
export type BackendUpdateWarehouseInput = z.input<
  typeof backendUpdateWarehouseSchema
>;
