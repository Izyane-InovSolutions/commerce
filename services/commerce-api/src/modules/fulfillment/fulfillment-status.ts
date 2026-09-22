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
  /**
   * #37: true only for a SELLER-mode fulfillment order (warehouseId null) —
   * a PLATFORM order never requires acceptance and omits this (defaults to
   * false), so every existing caller/test is unaffected.
   */
  requiresAcceptance?: boolean;
  /** Set once FulfillmentsService.acceptSellerFulfillment records it. */
  acceptedAt?: Date | null;
};

/**
 * Derives FulfillmentOrder.status from its lines' quantities and its work
 * items' progress. Written to the row (not computed at read time) so it can
 * be filtered/indexed, but must always be recomputed by this function after
 * any mutation — never set directly.
 *
 * Priority order (first match wins), most-progressed state first: full
 * cancellation (every allocated unit cancelled — e.g. a seller rejecting
 * before acceptance) always wins first, since there is nothing left to
 * await, hold, or progress; then, for a SELLER-mode order that still has
 * active quantity and hasn't been accepted yet, AWAITING_ACCEPTANCE —
 * nothing can be on hold or otherwise in progress before it has even been
 * accepted; then an open exception (ON_HOLD); then dispatch, pack, and pick
 * progress each in turn (exact-match before partial, and a work item merely
 * IN_PROGRESS before any of its quantity has moved); finally a still-open
 * partial cancellation, or the untouched start state. This ordering is a
 * deliberate choice where the ticket's state list left the resolution
 * ambiguous — see purchase-order-status.ts for the same one-file-owns-the-
 * rule approach on the procurement side.
 */
export function deriveFulfillmentStatus(
  input: DeriveFulfillmentStatusInput,
): FulfillmentStatus {
  const { lines, pickWorkItemStatus, packWorkItemStatus, hasOpenException } =
    input;

  const totalAllocated = sum(lines, (l) => l.allocatedQuantity);
  const totalCancelled = sum(lines, (l) => l.cancelledQuantity);
  const totalActive = totalAllocated - totalCancelled;

  if (totalActive <= 0) return FulfillmentStatus.CANCELLED;

  if (input.requiresAcceptance && !input.acceptedAt) {
    return FulfillmentStatus.AWAITING_ACCEPTANCE;
  }

  if (hasOpenException) return FulfillmentStatus.ON_HOLD;

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
