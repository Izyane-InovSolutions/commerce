import { describe, expect, it } from 'vitest';

import type {
  BackendReturnInspection,
  BackendReturnReceipt,
  BackendReturnRequest,
} from '@commerce/contracts';

import {
  acceptedSellerOrderIds,
  isRetryableRefundCase,
  parseInspectionLines,
  parseReceiptLines,
  parseShippingRefunds,
  readyToFinalize,
  receiptCompletesReturn,
  returnItemProgress,
  returnSteps,
} from './returns';

const AT = '2026-09-01T10:00:00.000Z';

function item(id: string, orderItemId: string, quantity: number) {
  return {
    id,
    returnRequestId: 'ret',
    orderItemId,
    quantity,
    reasonCode: 'DAMAGED' as const,
    note: null,
    unitAmount: 1000,
    currency: 'ZMW',
    returnWindowDays: 14,
    eligibleUntil: AT,
    deliveredAt: AT,
    createdAt: AT,
  };
}

function receipt(
  lines: { returnItemId: string; quantity: number }[],
  isClosing = false,
): BackendReturnReceipt {
  return {
    id: `rc-${lines.length}-${isClosing}`,
    returnRequestId: 'ret',
    warehouseId: 'wh',
    postedByUserId: 'u',
    isClosing,
    createdAt: AT,
    lines: lines.map((line, index) => ({ id: `rl-${index}`, ...line })),
  };
}

function inspection(
  lines: {
    returnItemId: string;
    acceptedQuantity: number;
    rejectedQuantity: number;
  }[],
): BackendReturnInspection {
  return {
    id: 'in',
    returnRequestId: 'ret',
    inspectedByUserId: 'u',
    isFinal: false,
    createdAt: AT,
    lines: lines.map((line, index) => ({
      id: `il-${index}`,
      warehouseId: 'wh',
      disposition: line.acceptedQuantity > 0 ? 'RESTOCK' : null,
      rejectionReason: line.rejectedQuantity > 0 ? 'Scratched' : null,
      ...line,
    })),
  };
}

function request(
  overrides: Partial<BackendReturnRequest> = {},
): BackendReturnRequest {
  return {
    id: 'ret',
    orderId: 'ord',
    userId: 'cus',
    status: 'RECEIVING',
    warehouseId: 'wh',
    assignedStaffId: null,
    rmaNumber: 'RMA-1',
    rmaInstructions: null,
    rejectionReason: null,
    version: 1,
    items: [item('a', 'oi-a', 3), item('b', 'oi-b', 1)],
    refundCases: [],
    receipts: [],
    inspections: [],
    events: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function fields(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

describe('returnSteps', () => {
  it('offers the review only while requested', () => {
    expect(returnSteps('REQUESTED')).toEqual(['approve', 'reject']);
  });

  it('keeps receiving open until the return is received', () => {
    expect(returnSteps('APPROVED')).toEqual(['receive']);
    expect(returnSteps('RECEIVING')).toEqual(['receive']);
  });

  it('only offers finalize once inspection has started', () => {
    expect(returnSteps('RECEIVED')).toEqual(['inspect']);
    expect(returnSteps('INSPECTING')).toEqual(['inspect', 'finalize']);
  });

  it('offers nothing on a closed or refunded return', () => {
    for (const status of [
      'REJECTED',
      'CANCELLED',
      'CLOSED_NO_REFUND',
      'REFUND_PENDING',
      'REFUND_FAILED',
      'REFUNDED',
    ] as const) {
      expect(returnSteps(status)).toEqual([]);
    }
  });
});

describe('returnItemProgress', () => {
  it('sums receipts and inspections per item', () => {
    const progress = returnItemProgress(
      request({
        receipts: [
          receipt([{ returnItemId: 'a', quantity: 2 }]),
          receipt([{ returnItemId: 'a', quantity: 1 }]),
        ],
        inspections: [
          inspection([
            { returnItemId: 'a', acceptedQuantity: 1, rejectedQuantity: 1 },
          ]),
        ],
      }),
    );
    expect(progress.get('a')).toEqual({
      requested: 3,
      received: 3,
      accepted: 1,
      rejected: 1,
      toReceive: 0,
      toInspect: 1,
    });
    expect(progress.get('b')).toMatchObject({ received: 0, toReceive: 1 });
  });

  it('expects nothing more once a closing receipt is posted', () => {
    const progress = returnItemProgress(
      request({
        receipts: [receipt([{ returnItemId: 'a', quantity: 1 }], true)],
      }),
    );
    expect(progress.get('a')?.toReceive).toBe(0);
    expect(progress.get('b')?.toReceive).toBe(0);
  });
});

describe('receiptCompletesReturn', () => {
  it('is true when the lines cover everything still expected', () => {
    const progress = returnItemProgress(request());
    expect(
      receiptCompletesReturn(progress, [
        { returnItemId: 'a', quantity: 3 },
        { returnItemId: 'b', quantity: 1 },
      ]),
    ).toBe(true);
  });

  it('is false while any unit is still expected', () => {
    const progress = returnItemProgress(request());
    expect(
      receiptCompletesReturn(progress, [{ returnItemId: 'a', quantity: 3 }]),
    ).toBe(false);
  });
});

describe('readyToFinalize', () => {
  it('waits for every received unit to be decided', () => {
    const received = request({
      receipts: [receipt([{ returnItemId: 'a', quantity: 2 }], true)],
    });
    expect(readyToFinalize(returnItemProgress(received))).toBe(false);
    expect(
      readyToFinalize(
        returnItemProgress({
          ...received,
          inspections: [
            inspection([
              { returnItemId: 'a', acceptedQuantity: 2, rejectedQuantity: 0 },
            ]),
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe('parseReceiptLines', () => {
  it('drops blank and zero rows', () => {
    expect(
      parseReceiptLines(
        ['a', 'b'],
        fields({ 'receive.a': '2', 'receive.b': '0' }),
      ),
    ).toEqual({ ok: true, lines: [{ returnItemId: 'a', quantity: 2 }] });
  });

  it('asks for at least one unit', () => {
    const parsed = parseReceiptLines(['a'], fields({}));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.fieldErrors.lines).toBeTruthy();
  });

  it('refuses fractions and negatives against the field', () => {
    const parsed = parseReceiptLines(
      ['a', 'b'],
      fields({ 'receive.a': '1.5', 'receive.b': '-1' }),
    );
    expect(!parsed.ok && Object.keys(parsed.fieldErrors)).toEqual([
      'receive.a',
      'receive.b',
    ]);
  });
});

describe('parseInspectionLines', () => {
  it('builds a line per decided item, against the return warehouse', () => {
    expect(
      parseInspectionLines(
        ['a', 'b'],
        'wh',
        fields({
          'accept.a': '2',
          'disposition.a': 'RESTOCK',
          'reject.a': '1',
          'reason.a': ' Scratched ',
          'accept.b': '0',
          'reject.b': '0',
        }),
      ),
    ).toEqual({
      ok: true,
      lines: [
        {
          returnItemId: 'a',
          warehouseId: 'wh',
          acceptedQuantity: 2,
          disposition: 'RESTOCK',
          rejectedQuantity: 1,
          rejectionReason: 'Scratched',
        },
      ],
    });
  });

  it('needs a disposition for accepted units and a reason for rejected ones', () => {
    const parsed = parseInspectionLines(
      ['a'],
      'wh',
      fields({ 'accept.a': '1', 'disposition.a': '', 'reject.a': '1' }),
    );
    expect(!parsed.ok && Object.keys(parsed.fieldErrors).sort()).toEqual([
      'disposition.a',
      'reason.a',
    ]);
  });

  it('drops the disposition when nothing is accepted', () => {
    const parsed = parseInspectionLines(
      ['a'],
      'wh',
      fields({
        'disposition.a': 'RESTOCK',
        'reject.a': '1',
        'reason.a': 'Worn',
      }),
    );
    expect(parsed.ok && parsed.lines[0]?.disposition).toBeUndefined();
  });

  it('asks for at least one decision', () => {
    expect(parseInspectionLines(['a'], 'wh', fields({})).ok).toBe(false);
  });
});

describe('parseShippingRefunds', () => {
  it('converts typed amounts to minor units and skips blanks', () => {
    expect(
      parseShippingRefunds(
        ['so-1', 'so-2'],
        fields({ 'shipping.so-1': '45.50', 'shipping.so-2': '' }),
      ),
    ).toEqual({ ok: true, lines: [{ sellerOrderId: 'so-1', amount: 4550 }] });
  });

  it('rejects an amount that is not a number', () => {
    expect(
      parseShippingRefunds(['so-1'], fields({ 'shipping.so-1': 'abc' })).ok,
    ).toBe(false);
  });
});

describe('acceptedSellerOrderIds', () => {
  it('lists only seller orders with accepted units', () => {
    const accepted = request({
      receipts: [
        receipt(
          [
            { returnItemId: 'a', quantity: 3 },
            { returnItemId: 'b', quantity: 1 },
          ],
          true,
        ),
      ],
      inspections: [
        inspection([
          { returnItemId: 'a', acceptedQuantity: 1, rejectedQuantity: 2 },
          { returnItemId: 'b', acceptedQuantity: 0, rejectedQuantity: 1 },
        ]),
      ],
    });
    expect(
      acceptedSellerOrderIds(
        accepted,
        returnItemProgress(accepted),
        new Map([
          ['oi-a', 'so-a'],
          ['oi-b', 'so-b'],
        ]),
      ),
    ).toEqual(['so-a']);
  });
});

describe('isRetryableRefundCase', () => {
  it('only retries a failed case', () => {
    const refundCase = {
      id: 'rc',
      sellerOrderId: 'so',
      returnRequestId: 'ret',
      source: 'RETURN' as const,
      amount: 1000,
      shippingAmount: 0,
      currency: 'ZMW',
      reason: 'Return',
      version: 1,
      createdAt: AT,
      updatedAt: AT,
    };
    expect(isRetryableRefundCase({ ...refundCase, status: 'FAILED' })).toBe(
      true,
    );
    expect(
      isRetryableRefundCase({
        ...refundCase,
        status: 'RECONCILIATION_REQUIRED',
      }),
    ).toBe(false);
  });
});
