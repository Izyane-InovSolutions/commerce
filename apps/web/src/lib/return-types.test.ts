import { describe, expect, it } from 'vitest';

import {
  buildReturnTimeline,
  summarizeRefund,
  validateReturnRequest,
  type ReturnEligibility,
  type ReturnEvent,
  type ReturnItem,
  type ReturnLineDraft,
  type ReturnRequest,
  type ReturnStatus,
} from './return-types';

function eligibility(
  overrides: Partial<ReturnEligibility> = {},
): ReturnEligibility {
  return {
    orderItemId: 'item-1',
    returnable: true,
    returnWindowDays: 30,
    totalRemainingQuantity: 2,
    chunks: [],
    ...overrides,
  };
}

function draft(overrides: Partial<ReturnLineDraft> = {}): ReturnLineDraft {
  return {
    orderItemId: 'item-1',
    selected: true,
    quantity: '1',
    reasonCode: 'DAMAGED',
    note: '',
    ...overrides,
  };
}

describe('validateReturnRequest', () => {
  it('builds the API body from the selected lines only', () => {
    const result = validateReturnRequest(
      [
        draft({ quantity: '2', note: '  cracked lid ' }),
        draft({ orderItemId: 'item-2', selected: false }),
      ],
      [eligibility(), eligibility({ orderItemId: 'item-2' })],
    );

    expect(result).toEqual({
      ok: true,
      input: {
        items: [
          {
            orderItemId: 'item-1',
            quantity: 2,
            reasonCode: 'DAMAGED',
            note: 'cracked lid',
          },
        ],
      },
    });
  });

  it('asks for at least one line', () => {
    const result = validateReturnRequest(
      [draft({ selected: false })],
      [eligibility()],
    );
    expect(result).toMatchObject({
      ok: false,
      message: 'Select at least one item to return.',
    });
  });

  it('caps the quantity at what is still returnable', () => {
    const result = validateReturnRequest(
      [draft({ quantity: '3' })],
      [eligibility()],
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { 'quantity.item-1': ['You can return at most 2.'] },
    });
  });

  it('needs a reason, and refuses a line that is no longer returnable', () => {
    expect(
      validateReturnRequest([draft({ reasonCode: '' })], [eligibility()]),
    ).toMatchObject({
      ok: false,
      fieldErrors: { 'reasonCode.item-1': ['Choose a reason.'] },
    });
    expect(
      validateReturnRequest(
        [draft()],
        [eligibility({ returnable: false, reason: 'Return window closed' })],
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { 'quantity.item-1': ['Return window closed'] },
    });
  });
});

function statusEvent(to: ReturnStatus, createdAt: string): ReturnEvent {
  return { id: `event-${to}`, type: 'STATUS_CHANGED', data: { to }, createdAt };
}

function request(
  status: ReturnStatus,
  events: ReturnEvent[] = [],
  overrides: Partial<ReturnRequest> = {},
): ReturnRequest {
  return {
    id: 'return-1',
    orderId: 'order-1',
    status,
    rmaNumber: null,
    rmaInstructions: null,
    rejectionReason: null,
    version: 0,
    items: [],
    events,
    refundCases: [],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function states(steps: ReturnType<typeof buildReturnTimeline>) {
  return steps.map((step) => `${step.key}:${step.state}`);
}

describe('buildReturnTimeline', () => {
  it('shows a fresh request waiting on approval', () => {
    const steps = buildReturnTimeline(
      request('REQUESTED', [
        statusEvent('REQUESTED', '2026-09-01T10:00:00.000Z'),
      ]),
    );
    expect(states(steps)).toEqual([
      'requested:done',
      'approved:current',
      'received:upcoming',
      'inspected:upcoming',
      'refund:upcoming',
    ]);
    expect(steps[0]?.timestamp).toBe('2026-09-01T10:00:00.000Z');
    expect(steps[1]?.detail).toBeTruthy();
    expect(steps[2]?.detail).toBeNull();
  });

  it('asks an approved return to be sent back', () => {
    const steps = buildReturnTimeline(
      request('APPROVED', [
        statusEvent('APPROVED', '2026-09-02T09:00:00.000Z'),
      ]),
    );
    expect(states(steps)).toEqual([
      'requested:done',
      'approved:done',
      'received:current',
      'inspected:upcoming',
      'refund:upcoming',
    ]);
    expect(steps[1]?.timestamp).toBe('2026-09-02T09:00:00.000Z');
    expect(steps[2]?.detail).toMatch(/send the items back/i);
  });

  it('ticks every step off once refunded', () => {
    const steps = buildReturnTimeline(
      request('REFUNDED', [
        statusEvent('APPROVED', '2026-09-02T09:00:00.000Z'),
        statusEvent('RECEIVED', '2026-09-05T09:00:00.000Z'),
        statusEvent('REFUND_PENDING', '2026-09-06T09:00:00.000Z'),
        statusEvent('REFUNDED', '2026-09-07T09:00:00.000Z'),
      ]),
    );
    expect(states(steps)).toEqual([
      'requested:done',
      'approved:done',
      'received:done',
      'inspected:done',
      'refund:done',
    ]);
    expect(steps[3]?.timestamp).toBe('2026-09-06T09:00:00.000Z');
    expect(steps[4]?.timestamp).toBe('2026-09-07T09:00:00.000Z');
  });

  it('marks a pending refund as current and a failed one as an issue', () => {
    expect(states(buildReturnTimeline(request('REFUND_PENDING'))).at(-1)).toBe(
      'refund:current',
    );
    expect(states(buildReturnTimeline(request('REFUND_FAILED'))).at(-1)).toBe(
      'refund:issue',
    );
    expect(
      states(buildReturnTimeline(request('CLOSED_NO_REFUND'))).at(-1),
    ).toBe('refund:issue');
  });

  it('stops at the rejection, with the reason', () => {
    const steps = buildReturnTimeline(
      request('REJECTED', [], { rejectionReason: 'Outside the return window' }),
    );
    expect(states(steps)).toEqual(['requested:done', 'rejected:issue']);
    expect(steps[1]?.detail).toBe('Outside the return window');
  });

  it('stops at a withdrawal', () => {
    expect(states(buildReturnTimeline(request('CANCELLED')))).toEqual([
      'requested:done',
      'cancelled:issue',
    ]);
  });
});

function item(unitAmount: number, quantity: number): ReturnItem {
  return {
    id: `return-item-${unitAmount}`,
    orderItemId: 'item-1',
    quantity,
    reasonCode: 'DAMAGED',
    note: null,
    unitAmount,
    currency: 'ZMW',
    eligibleUntil: '2026-10-01T00:00:00.000Z',
    deliveredAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('summarizeRefund', () => {
  it('estimates from the items until a refund exists', () => {
    expect(
      summarizeRefund(request('APPROVED', [], { items: [item(1000, 2), item(250, 1)] })),
    ).toEqual({ amount: 2250, currency: 'ZMW', estimated: true });
  });

  it('adds up the refund cases once they exist, ignoring cancelled ones', () => {
    expect(
      summarizeRefund(
        request('REFUNDED', [], {
          items: [item(1000, 2)],
          refundCases: [
            { id: 'rc-1', status: 'SUCCEEDED', amount: 2300, shippingAmount: 300, currency: 'ZMW' },
            { id: 'rc-2', status: 'CANCELLED', amount: 900, shippingAmount: 0, currency: 'ZMW' },
          ],
        }),
      ),
    ).toEqual({ amount: 2300, currency: 'ZMW', estimated: false });
  });

  it('has nothing to say for a return that will not be refunded', () => {
    for (const status of ['CANCELLED', 'REJECTED', 'CLOSED_NO_REFUND'] as const) {
      expect(summarizeRefund(request(status, [], { items: [item(1000, 1)] }))).toBeNull();
    }
  });
});
