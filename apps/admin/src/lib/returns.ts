import type {
  BackendRefundCase,
  BackendReturnDisposition,
  BackendReturnEvent,
  BackendReturnInspection,
  BackendReturnReceipt,
  BackendReturnRequest,
  BackendReturnStatus,
} from '@commerce/contracts';

import { toMinor } from './money';

/*
 * The return workflow as `ReturnsService` enforces it:
 *
 *   REQUESTED → APPROVED (or REJECTED)
 *   APPROVED → RECEIVING → RECEIVED        receipts, the last one "closing"
 *   RECEIVED → INSPECTING                  inspections, any number of them
 *   INSPECTING → REFUND_* / CLOSED_NO_REFUND   finalize
 *
 * The page only offers the step the status allows, so the API's 409s are a
 * backstop rather than the way an admin finds out a button did nothing.
 */

export type ReturnStep = 'approve' | 'reject' | 'receive' | 'inspect' | 'finalize';

/** Mirrors the status guards on each `ReturnsService` write. */
export function returnSteps(status: BackendReturnStatus): ReturnStep[] {
  switch (status) {
    case 'REQUESTED':
      return ['approve', 'reject'];
    case 'APPROVED':
    case 'RECEIVING':
      return ['receive'];
    case 'RECEIVED':
      return ['inspect'];
    case 'INSPECTING':
      return ['inspect', 'finalize'];
    default:
      return [];
  }
}

/** What each status means, and what — if anything — happens next. */
export const RETURN_STATUS_HELP: Record<BackendReturnStatus, string> = {
  REQUESTED:
    'The customer asked to send items back. Approve it against the warehouse that will receive them, or reject it with a reason the customer will see.',
  APPROVED:
    'Approved with an RMA number. Waiting for the parcel to arrive at the warehouse.',
  REJECTED: 'Rejected. Nothing will be received or refunded.',
  CANCELLED: 'Withdrawn by the customer before it was reviewed.',
  RECEIVING:
    'Some units have arrived. Record the rest as they come in, and mark the last delivery as closing.',
  RECEIVED:
    'Everything expected has arrived (or the rest was written off by a closing receipt). Inspect the units next.',
  INSPECTING:
    'Inspection has started. Once every received unit is accepted or rejected, finalize to raise the refunds.',
  CLOSED_NO_REFUND:
    'Every unit was rejected at inspection, so nothing is refunded.',
  REFUND_PENDING: 'Refund cases were raised and are waiting on the gateway.',
  PARTIALLY_REFUNDED:
    'Some seller orders were refunded and some were not — see the refund cases below.',
  REFUNDED: 'Every refund case succeeded.',
  REFUND_FAILED:
    'The gateway refused the refund. See the refund cases below.',
};

export const RETURN_DISPOSITION_LABELS: Record<BackendReturnDisposition, string> = {
  RESTOCK: 'Restock (back into available stock)',
  QUARANTINE: 'Quarantine',
  DAMAGED: 'Damaged',
  DISPOSE: 'Dispose',
};

/*
 * `backendReturnRequestSchema` types receipts and inspections as `unknown[]`
 * because the customer side never reads them; `backend-returns.ts` describes
 * the rows the admin read really carries. These narrow to that shape once,
 * here, rather than casting at every use.
 */
export function readReceipts(request: BackendReturnRequest): BackendReturnReceipt[] {
  return request.receipts as BackendReturnReceipt[];
}

export function readInspections(
  request: BackendReturnRequest,
): BackendReturnInspection[] {
  return request.inspections as BackendReturnInspection[];
}

/** Oldest first, as the API writes them. */
export function readEvents(request: BackendReturnRequest): BackendReturnEvent[] {
  return [...(request.events as BackendReturnEvent[])].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

/** Where one return item stands across every receipt and inspection so far. */
export type ReturnItemProgress = {
  requested: number;
  received: number;
  accepted: number;
  rejected: number;
  /** Still expected at the warehouse. Zero once a closing receipt is posted. */
  toReceive: number;
  /** Received but not yet accepted or rejected. */
  toInspect: number;
};

/**
 * Sums receipts and inspections per return item, the way `sumReceivedByItem`
 * and `sumInspectedByItem` do on the server — so the forms default to, and
 * cap at, the quantities the API will accept.
 */
export function returnItemProgress(
  request: BackendReturnRequest,
): Map<string, ReturnItemProgress> {
  const receipts = readReceipts(request);
  const closed = receipts.some((receipt) => receipt.isClosing);
  const received = new Map<string, number>();
  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      received.set(
        line.returnItemId,
        (received.get(line.returnItemId) ?? 0) + line.quantity,
      );
    }
  }

  const accepted = new Map<string, number>();
  const rejected = new Map<string, number>();
  for (const inspection of readInspections(request)) {
    for (const line of inspection.lines) {
      accepted.set(
        line.returnItemId,
        (accepted.get(line.returnItemId) ?? 0) + line.acceptedQuantity,
      );
      rejected.set(
        line.returnItemId,
        (rejected.get(line.returnItemId) ?? 0) + line.rejectedQuantity,
      );
    }
  }

  const progress = new Map<string, ReturnItemProgress>();
  for (const item of request.items) {
    const itemReceived = received.get(item.id) ?? 0;
    const itemAccepted = accepted.get(item.id) ?? 0;
    const itemRejected = rejected.get(item.id) ?? 0;
    progress.set(item.id, {
      requested: item.quantity,
      received: itemReceived,
      accepted: itemAccepted,
      rejected: itemRejected,
      toReceive: closed ? 0 : Math.max(0, item.quantity - itemReceived),
      toInspect: Math.max(0, itemReceived - itemAccepted - itemRejected),
    });
  }
  return progress;
}

/**
 * Whether these receipt lines bring in everything still expected. The API
 * only moves a return on to RECEIVED on a *closing* receipt, and once
 * nothing is left to receive no later receipt could carry a line — so a
 * receipt that completes the return has to be the closing one.
 */
export function receiptCompletesReturn(
  progress: ReadonlyMap<string, ReturnItemProgress>,
  lines: readonly { returnItemId: string; quantity: number }[],
): boolean {
  const incoming = new Map<string, number>();
  for (const line of lines) {
    incoming.set(
      line.returnItemId,
      (incoming.get(line.returnItemId) ?? 0) + line.quantity,
    );
  }
  return [...progress.entries()].every(
    ([itemId, item]) => item.toReceive - (incoming.get(itemId) ?? 0) <= 0,
  );
}

/**
 * Finalizing is refused while any received unit is still undecided — the
 * completeness check at the top of `finalizeInternal`.
 */
export function readyToFinalize(
  progress: ReadonlyMap<string, ReturnItemProgress>,
): boolean {
  return [...progress.values()].every((item) => item.toInspect === 0);
}

/**
 * Only a `FAILED` case can be retried; `RECONCILIATION_REQUIRED` has to be
 * reconciled with the gateway first (`RefundCasesService.retry`).
 */
export function isRetryableRefundCase(refundCase: BackendRefundCase): boolean {
  return refundCase.status === 'FAILED';
}

/* ---- form parsing ---- */

/** A field lookup — `FormData.get`, or a plain record in tests. */
type Field = (name: string) => string | null;

export function formField(formData: FormData): Field {
  return (name) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : null;
  };
}

function wholeNumber(raw: string | null): number | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export type ParsedLines<T> =
  | { ok: true; lines: T[] }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Receipt lines from `receive.<returnItemId>` fields. Blank and zero rows are
 * dropped — the API wants at least one line and every line at least one unit.
 */
export function parseReceiptLines(
  itemIds: readonly string[],
  field: Field,
): ParsedLines<{ returnItemId: string; quantity: number }> {
  const fieldErrors: Record<string, string[]> = {};
  const lines: { returnItemId: string; quantity: number }[] = [];
  for (const returnItemId of itemIds) {
    const name = `receive.${returnItemId}`;
    const quantity = wholeNumber(field(name));
    if (quantity === null) {
      fieldErrors[name] = ['Enter a whole number of units.'];
    } else if (quantity > 0) {
      lines.push({ returnItemId, quantity });
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  if (lines.length === 0) {
    return {
      ok: false,
      fieldErrors: { lines: ['Enter how many units arrived for at least one item.'] },
    };
  }
  return { ok: true, lines };
}

export type InspectionLineInput = {
  returnItemId: string;
  warehouseId: string;
  acceptedQuantity: number;
  disposition?: BackendReturnDisposition;
  rejectedQuantity: number;
  rejectionReason?: string;
};

const DISPOSITIONS = new Set<string>(Object.keys(RETURN_DISPOSITION_LABELS));

/**
 * Inspection lines from `accept.`, `disposition.`, `reject.` and `reason.`
 * fields per return item, checked the way `validateInspectionLines` checks
 * them: accepted units need a disposition, rejected ones a reason, and a line
 * that decides nothing is left out rather than sent.
 */
export function parseInspectionLines(
  itemIds: readonly string[],
  warehouseId: string,
  field: Field,
): ParsedLines<InspectionLineInput> {
  const fieldErrors: Record<string, string[]> = {};
  const lines: InspectionLineInput[] = [];
  for (const returnItemId of itemIds) {
    const accepted = wholeNumber(field(`accept.${returnItemId}`));
    const rejected = wholeNumber(field(`reject.${returnItemId}`));
    const disposition = (field(`disposition.${returnItemId}`) ?? '').trim();
    const reason = (field(`reason.${returnItemId}`) ?? '').trim();

    if (accepted === null) {
      fieldErrors[`accept.${returnItemId}`] = ['Enter a whole number of units.'];
    }
    if (rejected === null) {
      fieldErrors[`reject.${returnItemId}`] = ['Enter a whole number of units.'];
    }
    if (accepted === null || rejected === null) continue;
    if (accepted === 0 && rejected === 0) continue;

    if (accepted > 0 && !DISPOSITIONS.has(disposition)) {
      fieldErrors[`disposition.${returnItemId}`] = [
        'Choose what happens to the accepted units.',
      ];
    }
    if (rejected > 0 && reason === '') {
      fieldErrors[`reason.${returnItemId}`] = ['Say why the units were rejected.'];
    }

    lines.push({
      returnItemId,
      warehouseId,
      acceptedQuantity: accepted,
      disposition:
        accepted > 0 ? (disposition as BackendReturnDisposition) : undefined,
      rejectedQuantity: rejected,
      rejectionReason: rejected > 0 ? reason : undefined,
    });
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  if (lines.length === 0) {
    return {
      ok: false,
      fieldErrors: { lines: ['Accept or reject at least one unit.'] },
    };
  }
  return { ok: true, lines };
}

/**
 * The seller orders a finalize would raise refund cases for: those with at
 * least one accepted unit. Shipping can only be refunded against these —
 * the API rejects a shipping refund for any other seller order.
 */
export function acceptedSellerOrderIds(
  request: BackendReturnRequest,
  progress: ReadonlyMap<string, ReturnItemProgress>,
  sellerOrderByOrderItem: ReadonlyMap<string, string | null>,
): string[] {
  const ids = new Set<string>();
  for (const item of request.items) {
    if ((progress.get(item.id)?.accepted ?? 0) <= 0) continue;
    const sellerOrderId = sellerOrderByOrderItem.get(item.orderItemId);
    if (sellerOrderId) ids.add(sellerOrderId);
  }
  return [...ids].sort();
}

/**
 * Optional shipping refunds from `shipping.<sellerOrderId>` fields, typed in
 * major units. Blank means "refund no shipping" — the API's own default.
 */
export function parseShippingRefunds(
  sellerOrderIds: readonly string[],
  field: Field,
): ParsedLines<{ sellerOrderId: string; amount: number }> {
  const fieldErrors: Record<string, string[]> = {};
  const lines: { sellerOrderId: string; amount: number }[] = [];
  for (const sellerOrderId of sellerOrderIds) {
    const name = `shipping.${sellerOrderId}`;
    const raw = (field(name) ?? '').trim();
    if (raw === '') continue;
    const amount = toMinor(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      fieldErrors[name] = ['Enter an amount, or leave it blank.'];
    } else if (amount > 0) {
      lines.push({ sellerOrderId, amount });
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, lines };
}
