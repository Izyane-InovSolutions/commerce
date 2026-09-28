/**
 * Local mirror of the Commerce API's customer return shapes
 * (`services/commerce-api/src/modules/returns`), plus the pure rules the
 * request form checks before posting.
 *
 * Kept apart from `returns.ts` so client components can import the labels
 * and validation without pulling in the server-side API client.
 */

export type ReturnReasonCode =
  | 'CUSTOMER_REMORSE'
  | 'WRONG_ITEM'
  | 'DAMAGED'
  | 'DEFECTIVE'
  | 'NOT_AS_DESCRIBED'
  | 'SIZE_FIT'
  | 'OTHER';

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  CUSTOMER_REMORSE: 'Changed my mind',
  WRONG_ITEM: 'Wrong item sent',
  DAMAGED: 'Arrived damaged',
  DEFECTIVE: 'Faulty or not working',
  NOT_AS_DESCRIBED: 'Not as described',
  SIZE_FIT: 'Wrong size or fit',
  OTHER: 'Something else',
};

export const RETURN_REASON_CODES = Object.keys(
  RETURN_REASON_LABELS,
) as ReturnReasonCode[];

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'RECEIVING'
  | 'RECEIVED'
  | 'INSPECTING'
  | 'CLOSED_NO_REFUND'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'REFUND_FAILED';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved — send it back',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  RECEIVING: 'Being received',
  RECEIVED: 'Received',
  INSPECTING: 'Being inspected',
  CLOSED_NO_REFUND: 'Closed without refund',
  REFUND_PENDING: 'Refund on its way',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
  REFUND_FAILED: 'Refund failed',
};

/** Per order line, from `GET /orders/:orderId/return-eligibility`. */
export type ReturnEligibility = {
  orderItemId: string;
  returnable: boolean;
  /** Why not, when `returnable` is false. */
  reason?: string;
  returnWindowDays: number;
  /** Units still inside their return window and not claimed by another
   * return — the most this line can be returned at now. */
  totalRemainingQuantity: number;
  chunks: {
    shipmentLineId: string;
    deliveredAt: string;
    eligibleUntil: string;
    remainingQuantity: number;
  }[];
};

export type ReturnRequestItemInput = {
  orderItemId: string;
  quantity: number;
  reasonCode: ReturnReasonCode;
  note?: string;
};

export type ReturnRequestInput = { items: ReturnRequestItemInput[] };

export type ReturnItem = {
  id: string;
  orderItemId: string;
  quantity: number;
  reasonCode: ReturnReasonCode;
  note: string | null;
  unitAmount: number;
  currency: string;
  eligibleUntil: string;
  deliveredAt: string;
};

export type ReturnEvent = {
  id: string;
  type: string;
  data: unknown;
  createdAt: string;
};

export type ReturnRefundCase = {
  id: string;
  status: string;
  amount: number;
  shippingAmount: number;
  currency: string;
};

export type ReturnRequest = {
  id: string;
  orderId: string;
  status: ReturnStatus;
  rmaNumber: string | null;
  rmaInstructions: string | null;
  rejectionReason: string | null;
  /** Optimistic-concurrency counter — sent back to cancel. */
  version: number;
  items: ReturnItem[];
  events: ReturnEvent[];
  refundCases: ReturnRefundCase[];
  createdAt: string;
  updatedAt: string;
};

/** Only a request nobody has acted on yet can be withdrawn. */
export function isReturnCancellable(request: Pick<ReturnRequest, 'status'>) {
  return request.status === 'REQUESTED';
}

/** What the form collected for one line, before it has been checked. */
export type ReturnLineDraft = {
  orderItemId: string;
  selected: boolean;
  /** As typed — a string, since it comes straight off a form field. */
  quantity: string;
  reasonCode: string;
  note: string;
};

export type ReturnValidation =
  | { ok: true; input: ReturnRequestInput }
  | { ok: false; message?: string; fieldErrors: Record<string, string[]> };

/** The API caps nothing on the note, but a return reason is not an essay. */
export const RETURN_NOTE_MAX_LENGTH = 500;

/**
 * Checks a return request against what eligibility allows, before it goes
 * to the API — which checks the same rules again under a lock, so this is
 * for a clear message up front, not for enforcement.
 *
 * Field errors are keyed `quantity.<orderItemId>` / `reasonCode.<orderItemId>`,
 * matching the form's own field names.
 */
export function validateReturnRequest(
  drafts: ReturnLineDraft[],
  eligibility: ReturnEligibility[],
): ReturnValidation {
  const byItem = new Map(eligibility.map((line) => [line.orderItemId, line]));
  const fieldErrors: Record<string, string[]> = {};
  const items: ReturnRequestItemInput[] = [];
  const seen = new Set<string>();

  for (const draft of drafts) {
    if (!draft.selected || seen.has(draft.orderItemId)) {
      continue;
    }
    seen.add(draft.orderItemId);

    const line = byItem.get(draft.orderItemId);
    if (!line || !line.returnable || line.totalRemainingQuantity < 1) {
      fieldErrors[`quantity.${draft.orderItemId}`] = [
        line?.reason ?? 'This item can no longer be returned.',
      ];
      continue;
    }

    const quantity = Number(draft.quantity.trim());
    if (!Number.isInteger(quantity) || quantity < 1) {
      fieldErrors[`quantity.${draft.orderItemId}`] = [
        'Enter a whole number of at least one.',
      ];
    } else if (quantity > line.totalRemainingQuantity) {
      fieldErrors[`quantity.${draft.orderItemId}`] = [
        `You can return at most ${line.totalRemainingQuantity}.`,
      ];
    }

    const reasonCode = draft.reasonCode as ReturnReasonCode;
    if (!RETURN_REASON_CODES.includes(reasonCode)) {
      fieldErrors[`reasonCode.${draft.orderItemId}`] = ['Choose a reason.'];
    }

    const note = draft.note.trim();
    if (note.length > RETURN_NOTE_MAX_LENGTH) {
      fieldErrors[`note.${draft.orderItemId}`] = [
        `Keep it under ${RETURN_NOTE_MAX_LENGTH} characters.`,
      ];
    }

    items.push({
      orderItemId: draft.orderItemId,
      quantity,
      reasonCode,
      ...(note ? { note } : {}),
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  if (items.length === 0) {
    return {
      ok: false,
      message: 'Select at least one item to return.',
      fieldErrors: {},
    };
  }

  return { ok: true, input: { items } };
}

/** One milestone on a return's timeline — the same shape the order page's
 * shipping timeline renders (`TimelineList`). */
export type ReturnTimelineStep = {
  key: string;
  label: string;
  detail?: string | null;
  timestamp?: string | null;
  state: 'done' | 'current' | 'upcoming' | 'issue';
};

/** Statuses that come after inspection — the request has been decided. */
const DECIDED: ReturnStatus[] = [
  'CLOSED_NO_REFUND',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'REFUND_FAILED',
];

/** How far along the happy path a status is: 1 approved, 2 received,
 * 3 inspected. Rejected and cancelled never get past 0. */
function progress(status: ReturnStatus): number {
  if (DECIDED.includes(status)) return 3;
  if (status === 'RECEIVED' || status === 'INSPECTING') return 2;
  if (status === 'APPROVED' || status === 'RECEIVING') return 1;
  return 0;
}

/** When the request last moved into one of `statuses`, from its
 * `STATUS_CHANGED` events (`data.to`); null when no event says. */
function reachedAt(
  events: ReturnEvent[],
  statuses: ReturnStatus[],
): string | null {
  const matches = events
    .filter((event) => {
      if (event.type !== 'STATUS_CHANGED') return false;
      const to = (event.data as { to?: unknown } | null)?.to;
      return typeof to === 'string' && statuses.includes(to as ReturnStatus);
    })
    .map((event) => event.createdAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return matches.at(-1) ?? null;
}

/**
 * A return's progress as fixed milestones — Requested, Approved, Received,
 * Inspected, then how the refund ended — ticked off as it moves, the same
 * way the shipping timeline reads. A rejected or withdrawn request stops
 * after "Requested" with the reason, rather than showing steps it will now
 * never reach.
 */
export function buildReturnTimeline(
  request: Pick<
    ReturnRequest,
    'status' | 'events' | 'createdAt' | 'rejectionReason'
  >,
): ReturnTimelineStep[] {
  const { status, events } = request;
  const requested: ReturnTimelineStep = {
    key: 'requested',
    label: 'Return requested',
    timestamp: reachedAt(events, ['REQUESTED']) ?? request.createdAt,
    state: 'done',
  };

  if (status === 'CANCELLED') {
    return [
      requested,
      {
        key: 'cancelled',
        label: 'Return cancelled',
        detail: 'This return was withdrawn. Nothing was sent back.',
        timestamp: reachedAt(events, ['CANCELLED']),
        state: 'issue',
      },
    ];
  }

  if (status === 'REJECTED') {
    return [
      requested,
      {
        key: 'rejected',
        label: 'Return rejected',
        detail: request.rejectionReason,
        timestamp: reachedAt(events, ['REJECTED']),
        state: 'issue',
      },
    ];
  }

  const reached = progress(status);
  const milestone = (
    index: number,
    key: string,
    label: string,
    at: ReturnStatus[],
    waiting: string,
  ): ReturnTimelineStep =>
    reached >= index
      ? { key, label, timestamp: reachedAt(events, at), state: 'done' }
      : {
          key,
          label,
          // Only the next milestone says what it is waiting on.
          detail: reached === index - 1 ? waiting : null,
          state: reached === index - 1 ? 'current' : 'upcoming',
        };

  const steps = [
    requested,
    milestone(
      1,
      'approved',
      'Approved',
      ['APPROVED'],
      'We’re reviewing your request.',
    ),
    milestone(
      2,
      'received',
      'Received by us',
      ['RECEIVED'],
      status === 'RECEIVING'
        ? 'Your parcel has arrived and is being checked in.'
        : 'Send the items back using the instructions on this page.',
    ),
    milestone(
      3,
      'inspected',
      'Inspected',
      DECIDED,
      'We’re checking the items you sent back.',
    ),
  ];

  const refundAt = reachedAt(events, [status]);
  let outcome: ReturnTimelineStep;
  switch (status) {
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      outcome = {
        key: 'refund',
        label: RETURN_STATUS_LABELS[status],
        timestamp: refundAt,
        state: 'done',
      };
      break;
    case 'REFUND_PENDING':
      outcome = {
        key: 'refund',
        label: 'Refund on its way',
        detail: 'It can take a few days to reach your account.',
        timestamp: refundAt,
        state: 'current',
      };
      break;
    case 'REFUND_FAILED':
      outcome = {
        key: 'refund',
        label: 'Refund failed',
        detail:
          'The refund did not go through. It will be retried; contact support if it is not resolved soon.',
        timestamp: refundAt,
        state: 'issue',
      };
      break;
    case 'CLOSED_NO_REFUND':
      outcome = {
        key: 'refund',
        label: 'Closed without refund',
        detail: 'After inspection, no refund was due on this return.',
        timestamp: refundAt,
        state: 'issue',
      };
      break;
    default:
      outcome = { key: 'refund', label: 'Refunded', state: 'upcoming' };
  }

  return [...steps, outcome];
}

export const REFUND_CASE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Refunded',
  PARTIALLY_SUCCEEDED: 'Partly refunded',
  FAILED: 'Failed',
  RECONCILIATION_REQUIRED: 'Being checked',
  CANCELLED: 'Cancelled',
};

/**
 * What the return is worth to the shopper: the refund amounts once they
 * exist (one refund case per seller, each already including any shipping
 * refunded), else an estimate from the items' own prices — shipping not
 * included, since whether it is refunded is decided at inspection.
 *
 * Null when there is nothing to say: withdrawn, rejected, or closed without
 * a refund. Assumes one currency, which an order always is.
 */
export function summarizeRefund(
  request: Pick<ReturnRequest, 'status' | 'items' | 'refundCases'>,
): { amount: number; currency: string; estimated: boolean } | null {
  if (
    request.status === 'CANCELLED' ||
    request.status === 'REJECTED' ||
    request.status === 'CLOSED_NO_REFUND'
  ) {
    return null;
  }

  const cases = request.refundCases.filter(
    (refund) => refund.status !== 'CANCELLED',
  );
  if (cases.length > 0) {
    return {
      amount: cases.reduce((sum, refund) => sum + refund.amount, 0),
      currency: cases[0]!.currency,
      estimated: false,
    };
  }

  const [first] = request.items;
  if (!first) {
    return null;
  }

  return {
    amount: request.items.reduce(
      (sum, item) => sum + item.unitAmount * item.quantity,
      0,
    ),
    currency: first.currency,
    estimated: true,
  };
}

/** Badge tone for a return's status, shared by the list and detail pages. */
export function returnStatusTone(
  status: ReturnStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return 'default';
    case 'REJECTED':
    case 'REFUND_FAILED':
      return 'destructive';
    case 'CANCELLED':
    case 'CLOSED_NO_REFUND':
      return 'outline';
    default:
      return 'secondary';
  }
}
