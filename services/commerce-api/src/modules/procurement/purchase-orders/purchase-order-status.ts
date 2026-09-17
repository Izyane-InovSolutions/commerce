import { ConflictException } from '@nestjs/common';
import { PurchaseOrderStatus } from '@prisma/client';

/**
 * Structural transitions only — who may trigger one, and side conditions
 * like "not your own PO" or "no receipts posted yet", are enforced by
 * PurchaseOrdersService. SUBMITTED -> DRAFT is "return to draft" (an
 * approver sending it back without rejecting outright).
 */
export const PURCHASE_ORDER_TRANSITIONS: Record<
  PurchaseOrderStatus,
  PurchaseOrderStatus[]
> = {
  [PurchaseOrderStatus.DRAFT]: [
    PurchaseOrderStatus.SUBMITTED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.SUBMITTED]: [
    PurchaseOrderStatus.APPROVED,
    PurchaseOrderStatus.REJECTED,
    PurchaseOrderStatus.DRAFT,
  ],
  [PurchaseOrderStatus.APPROVED]: [
    PurchaseOrderStatus.ORDERED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.REJECTED]: [],
  [PurchaseOrderStatus.ORDERED]: [
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CLOSED_SHORT,
  ],
  [PurchaseOrderStatus.RECEIVED]: [],
  [PurchaseOrderStatus.CLOSED_SHORT]: [],
  [PurchaseOrderStatus.CANCELLED]: [],
};

export function assertPurchaseOrderTransition(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): void {
  if (!PURCHASE_ORDER_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(
      `Cannot move a purchase order from ${from} to ${to}`,
    );
  }
}
