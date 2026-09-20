import { z } from 'zod';
import {
  backendFulfillmentStatusSchema,
  backendFulfillmentOrderSchema,
  backendRecordQuantitiesInputSchema,
  backendShipmentSchema,
  backendOrderItemSchema,
  backendReturnReasonCodeSchema,
  backendReturnStatusSchema,
  backendSellerOrderSchema,
  backendShipmentStatusSchema,
} from './backend.ts';

const quantity = z.int().nonnegative();
const date = z.iso.datetime();
export const backendSellerFulfillmentDetailSchema = z.object({
  id: z.uuid().nullable(),
  version: quantity,
  fulfillmentNumber: z.string(),
  status: backendFulfillmentStatusSchema,
  awaitingAcceptance: z.boolean(),
  acceptedAt: date.nullable(),
  heldReason: z.string().nullable(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      orderItemId: z.uuid(),
      variantId: z.uuid(),
      allocatedQuantity: quantity,
      pickedQuantity: quantity,
      packedQuantity: quantity,
      shipmentAssignedQuantity: quantity,
      dispatchedQuantity: quantity,
      cancelledQuantity: quantity,
    }),
  ),
  events: z.array(
    z.object({
      type: z.string(),
      actorUserId: z.uuid().nullable(),
      metadata: z.unknown().nullable(),
      createdAt: date,
    }),
  ),
});
export const backendSellerDestinationSchema = z.union([
  z.object({
    city: z.string(),
    region: z.string().nullable(),
    country: z.string(),
    label: z.string().nullable(),
    recipientName: z.string(),
    phone: z.string().nullable(),
    line1: z.string(),
    line2: z.string().nullable(),
    postalCode: z.string(),
  }),
  z
    .object({
      city: z.string(),
      region: z.string().nullable(),
      country: z.string(),
    })
    .strict(),
]);
export const backendSellerShipmentDetailSchema = z.object({
  id: z.uuid(),
  shipmentNumber: z.string(),
  status: backendShipmentStatusSchema,
  carrierCode: z.string(),
  methodCode: z.string(),
  trackingReference: z.string().nullable(),
  estimatedDeliveryAt: date.nullable(),
  dispatchedAt: date.nullable(),
  deliveredAt: date.nullable(),
  cancelledAt: date.nullable(),
  lines: z.array(z.object({ orderItemId: z.uuid(), quantity })),
  trackingEvents: z.array(
    z.object({
      source: z.string(),
      normalizedStatus: backendShipmentStatusSchema,
      description: z.string().nullable(),
      location: z.string().nullable(),
      occurredAt: date,
      isCorrection: z.boolean(),
    }),
  ),
});
export const backendSellerReturnLineSchema = z.object({
  returnItemId: z.uuid(),
  returnRequestId: z.uuid(),
  orderItemId: z.uuid(),
  status: backendReturnStatusSchema,
  reasonCode: backendReturnReasonCodeSchema,
  requestedQuantity: quantity,
  receivedQuantity: quantity,
  acceptedQuantity: quantity,
  rejectedQuantity: quantity,
  refunds: z.array(
    z.object({
      refundCaseId: z.uuid(),
      status: z.enum([
        'PENDING',
        'PROCESSING',
        'SUCCEEDED',
        'PARTIALLY_SUCCEEDED',
        'FAILED',
        'RECONCILIATION_REQUIRED',
        'CANCELLED',
      ]),
      amount: quantity,
      currency: z.string(),
    }),
  ),
  createdAt: date,
});
export type BackendSellerReturnLine = z.infer<
  typeof backendSellerReturnLineSchema
>;
export const backendSellerOrderDetailSchema = backendSellerOrderSchema.extend({
  shippingGroups: z.array(
    z.object({
      id: z.uuid(),
      fulfillmentMode: z.enum(['SELLER', 'PLATFORM']),
      serviceLevel: z.string(),
      methodName: z.string(),
      items: z.array(backendOrderItemSchema),
      destination: backendSellerDestinationSchema,
      fulfillmentOrders: z.array(backendSellerFulfillmentDetailSchema),
      shipments: z.array(backendSellerShipmentDetailSchema),
    }),
  ),
  returns: z.array(backendSellerReturnLineSchema),
});
export type BackendSellerOrderDetail = z.infer<
  typeof backendSellerOrderDetailSchema
>;
export const backendSellerOrderListItemSchema = backendSellerOrderSchema.extend(
  {
    fulfillmentOrders: z.array(
      z.object({
        id: z.uuid(),
        shippingGroupId: z.uuid(),
        fulfillmentMode: z.enum(['SELLER', 'PLATFORM']),
        status: backendFulfillmentStatusSchema,
        awaitingAcceptance: z.boolean(),
        acceptedAt: date.nullable(),
      }),
    ),
    shipments: z.object({
      count: quantity,
      statuses: z.partialRecord(backendShipmentStatusSchema, quantity),
    }),
    returns: z.object({
      total: quantity,
      byStatus: z.record(z.string(), quantity),
    }),
  },
);
export type BackendSellerOrderListItem = z.infer<
  typeof backendSellerOrderListItemSchema
>;
export const backendSellerShipmentMutationSchema = backendShipmentSchema
  .omit({ lines: true })
  .extend({ warehouseId: z.uuid().nullable() });
export type BackendSellerShipmentMutation = z.infer<
  typeof backendSellerShipmentMutationSchema
>;
export const backendSellerFulfillmentActionSchema =
  backendFulfillmentOrderSchema.extend({
    warehouseId: z.uuid().nullable(),
    acceptedAt: date.nullable(),
  });
export type BackendSellerFulfillmentAction = z.infer<
  typeof backendSellerFulfillmentActionSchema
>;
export const backendSellerDispatchResultSchema =
  backendSellerFulfillmentActionSchema
    .omit({ workItems: true, exceptions: true })
    .extend({ shipments: z.array(backendSellerShipmentMutationSchema) });
export type BackendSellerDispatchResult = z.infer<
  typeof backendSellerDispatchResultSchema
>;
export const backendSellerDispatchInputSchema =
  backendRecordQuantitiesInputSchema.extend({
    carrierCode: z.string().min(1),
    trackingReference: z.string().optional(),
    estimatedDeliveryAt: date.optional(),
  });
export type BackendSellerDispatchInput = z.input<
  typeof backendSellerDispatchInputSchema
>;
export const backendSellerTrackingInputSchema = z.object({
  normalizedStatus: z.enum([
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_FAILED',
    'EXCEPTION',
    'RETURN_TO_SENDER',
    'RETURNED',
  ]),
  occurredAt: date,
  description: z.string().optional(),
  location: z.string().optional(),
});
export type BackendSellerTrackingInput = z.input<
  typeof backendSellerTrackingInputSchema
>;
const balanceBuckets = z.object({
  available: z.int(),
  held: z.int(),
  pending: z.int(),
  paid: z.int(),
});
export const backendSellerBalanceIntegritySchema = z.object({
  sellerId: z.uuid(),
  currency: z.string().nullable(),
  actual: balanceBuckets,
  expected: balanceBuckets,
  discrepancies: z.array(z.string()),
});
export type BackendSellerBalanceIntegrity = z.infer<
  typeof backendSellerBalanceIntegritySchema
>;
