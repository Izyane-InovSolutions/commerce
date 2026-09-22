import { FulfillmentStatus } from '@prisma/client';

export const CUSTOMER_FULFILLMENT_SUMMARIES = [
  'PREPARING',
  'PACKED',
  'PARTIALLY_DISPATCHED',
  'DISPATCHED',
  'CANCELLED',
] as const;

export type CustomerFulfillmentSummary =
  (typeof CUSTOMER_FULFILLMENT_SUMMARIES)[number];

const DISPATCHED_LIKE: FulfillmentStatus[] = [
  FulfillmentStatus.DISPATCHED,
  FulfillmentStatus.CANCELLED,
];

/** Packing done (or moot, because cancelled) for every fulfillment order —
 * the signal the customer-facing shipping timeline ticks "Preparing for
 * shipment" off on, ahead of any shipment existing. */
const PACKED_LIKE: FulfillmentStatus[] = [
  FulfillmentStatus.PACKED,
  FulfillmentStatus.CANCELLED,
];

/**
 * Collapses internal FulfillmentStatus values (warehouse/staff detail) into
 * the small vocabulary customers see. No fulfillment order yet (still being
 * provisioned from the paid order, asynchronously) reads the same as one
 * still in progress — both are simply "being prepared."
 */
export function deriveCustomerFulfillmentSummary(
  fulfillmentOrderStatuses: FulfillmentStatus[],
): CustomerFulfillmentSummary {
  if (fulfillmentOrderStatuses.length === 0) return 'PREPARING';

  if (
    fulfillmentOrderStatuses.every(
      (status) => status === FulfillmentStatus.CANCELLED,
    )
  )
    return 'CANCELLED';

  if (fulfillmentOrderStatuses.every((status) => DISPATCHED_LIKE.includes(status)))
    return 'DISPATCHED';

  if (
    fulfillmentOrderStatuses.some(
      (status) =>
        status === FulfillmentStatus.DISPATCHED ||
        status === FulfillmentStatus.PARTIALLY_DISPATCHED,
    )
  )
    return 'PARTIALLY_DISPATCHED';

  if (fulfillmentOrderStatuses.every((status) => PACKED_LIKE.includes(status)))
    return 'PACKED';

  return 'PREPARING';
}
