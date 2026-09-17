import { FulfillmentStatus, FulfillmentWorkItemStatus } from '@prisma/client';

export type FulfillmentLineTotals = {
  allocatedQuantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  dispatchedQuantity: number;
  cancelledQuantity: number;
};

export type DeriveFulfillmentStatusInput = {
  lines: FulfillmentLineTotals[];
  pickWorkItemStatus: FulfillmentWorkItemStatus;
  packWorkItemStatus: FulfillmentWorkItemStatus;
  hasOpenException: boolean;
};

/**
 * Derives FulfillmentOrder.status from its lines' quantities and its work
 * items' progress. Written to the row (not computed at read time) so it can
 * be filtered/indexed, but must always be recomputed by this function after
 * any mutation — never set directly.
 *
 * Priority order (first match wins), most-progressed state first: an open
 * exception always wins (ON_HOLD); then full cancellation; then dispatch,
 * pack, and pick progress each in turn (exact-match before partial, and a
 * work item merely IN_PROGRESS before any of its quantity has moved);
 * finally a still-open partial cancellation, or the untouched start state.
 * This ordering is a deliberate choice where the ticket's state list left
 * the resolution ambiguous — see purchase-order-status.ts for the same
 * one-file-owns-the-rule approach on the procurement side.
 */
export function deriveFulfillmentStatus(
  input: DeriveFulfillmentStatusInput,
): FulfillmentStatus {
  const { lines, pickWorkItemStatus, packWorkItemStatus, hasOpenException } =
    input;

  if (hasOpenException) return FulfillmentStatus.ON_HOLD;

  const totalAllocated = sum(lines, (l) => l.allocatedQuantity);
  const totalCancelled = sum(lines, (l) => l.cancelledQuantity);
  const totalActive = totalAllocated - totalCancelled;

  if (totalActive <= 0) return FulfillmentStatus.CANCELLED;

  const totalDispatched = sum(lines, (l) => l.dispatchedQuantity);
  if (totalDispatched >= totalActive) return FulfillmentStatus.DISPATCHED;
  if (totalDispatched > 0) return FulfillmentStatus.PARTIALLY_DISPATCHED;

  const totalPacked = sum(lines, (l) => l.packedQuantity);
  if (totalPacked >= totalActive) return FulfillmentStatus.PACKED;
  if (totalPacked > 0) return FulfillmentStatus.PARTIALLY_PACKED;
  if (packWorkItemStatus === FulfillmentWorkItemStatus.IN_PROGRESS)
    return FulfillmentStatus.PACKING;

  const totalPicked = sum(lines, (l) => l.pickedQuantity);
  if (totalPicked >= totalActive) return FulfillmentStatus.PICKED;
  if (totalPicked > 0) return FulfillmentStatus.PARTIALLY_PICKED;
  if (pickWorkItemStatus === FulfillmentWorkItemStatus.IN_PROGRESS)
    return FulfillmentStatus.PICKING;

  if (totalCancelled > 0) return FulfillmentStatus.PARTIALLY_CANCELLED;

  return FulfillmentStatus.READY_TO_PICK;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}
