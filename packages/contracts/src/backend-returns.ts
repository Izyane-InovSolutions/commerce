import { z } from 'zod';

import {
  backendReturnDispositionSchema,
  type BackendCreateReturnInput,
} from './backend.ts';

/* ---- returns: the detail rows the admin workflow reads ---- */

/*
 * `backendReturnRequestSchema` leaves receipts, inspections and events as
 * `unknown[]` because the customer side never reads them. The admin workflow
 * does — what has been received and inspected decides what can be posted
 * next — so these describe the rows `RETURN_REQUEST_INCLUDE` actually carries.
 */

export const backendReturnReceiptSchema = z.object({
  id: z.uuid(),
  returnRequestId: z.uuid(),
  warehouseId: z.uuid(),
  postedByUserId: z.uuid(),
  isClosing: z.boolean(),
  createdAt: z.iso.datetime(),
  lines: z
    .array(
      z.object({
        id: z.uuid(),
        returnItemId: z.uuid(),
        quantity: z.int(),
      }),
    )
    .default([]),
});
export type BackendReturnReceipt = z.infer<typeof backendReturnReceiptSchema>;

export const backendReturnInspectionSchema = z.object({
  id: z.uuid(),
  returnRequestId: z.uuid(),
  inspectedByUserId: z.uuid(),
  isFinal: z.boolean(),
  createdAt: z.iso.datetime(),
  lines: z
    .array(
      z.object({
        id: z.uuid(),
        returnItemId: z.uuid(),
        warehouseId: z.uuid(),
        acceptedQuantity: z.int(),
        disposition: backendReturnDispositionSchema.nullable(),
        rejectedQuantity: z.int(),
        rejectionReason: z.string().nullable(),
      }),
    )
    .default([]),
});
export type BackendReturnInspection = z.infer<
  typeof backendReturnInspectionSchema
>;

export const backendReturnEventSchema = z.object({
  id: z.uuid(),
  returnRequestId: z.uuid(),
  type: z.string(),
  actorUserId: z.uuid().nullable(),
  data: z.unknown(),
  createdAt: z.iso.datetime(),
});
export type BackendReturnEvent = z.infer<typeof backendReturnEventSchema>;

/**
 * An administrator opening a return for a customer — `AdminCreateReturnDto`,
 * which is the customer's request plus whose order it is.
 */
export type BackendAdminCreateReturnInput = BackendCreateReturnInput & {
  orderId: string;
  userId: string;
};
