import { ApiError } from '@commerce/api-client';
import type { BackendRefund } from '@commerce/contracts';
import { describe, expect, it } from 'vitest';

import {
  GATEWAY_PAGE_SIZE,
  describeRefund,
  formatGatewayAmount,
  isUuid,
  parseRefundForm,
  readGatewayPaymentQuery,
  refundableAmount,
  refundErrorState,
} from './payments';

const ID = '11111111-1111-4111-8111-111111111111';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function refund(overrides: Partial<BackendRefund> = {}): BackendRefund {
  return {
    id: ID,
    paymentId: ID,
    sellerOrderId: ID,
    refundCaseId: ID,
    amount: 1250,
    currency: 'ZMW',
    reason: 'Damaged',
    status: 'PROCESSING',
    providerReference: null,
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('readGatewayPaymentQuery', () => {
  it('turns the portal’s one-based page into the gateway’s zero-based one', () => {
    expect(readGatewayPaymentQuery({ page: '3' })).toEqual({
      page: 2,
      size: GATEWAY_PAGE_SIZE,
      sortBy: 'createdAt',
      descending: 'true',
    });
  });

  it('starts at the gateway’s first page for a missing or bad page', () => {
    expect(readGatewayPaymentQuery({}).page).toBe(0);
    expect(readGatewayPaymentQuery({ page: '0' }).page).toBe(0);
    expect(readGatewayPaymentQuery({ page: 'x' }).page).toBe(0);
  });
});

describe('formatGatewayAmount', () => {
  it('formats the gateway’s major units like any other amount', () => {
    expect(formatGatewayAmount(12.5, 'USD')).toBe('US$12.50');
  });

  it('does not drift on amounts that are inexact in binary', () => {
    expect(formatGatewayAmount(0.29, 'USD')).toBe('US$0.29');
  });
});

describe('isUuid', () => {
  it('accepts a UUID and nothing else', () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid('order-123')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('parseRefundForm', () => {
  it('converts the typed amount to minor units', () => {
    expect(
      parseRefundForm(
        form({ targetId: ID, amount: '1,012.50', reason: '  Damaged  ' }),
      ),
    ).toEqual({ ok: true, targetId: ID, amount: 101250, reason: 'Damaged' });
  });

  it('flags every bad field at once', () => {
    const parsed = parseRefundForm(
      form({ targetId: 'nope', amount: '12.345', reason: 'no' }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.fieldErrors).sort()).toEqual([
        'amount',
        'reason',
        'targetId',
      ]);
      expect(parsed.fieldErrors.amount).toHaveLength(1);
    }
  });

  it('refuses a zero amount with the contract’s message', () => {
    const parsed = parseRefundForm(
      form({ targetId: ID, amount: '0', reason: 'Damaged' }),
    );
    expect(parsed).toEqual({
      ok: false,
      fieldErrors: { amount: ['Enter an amount above zero.'] },
    });
  });
});

describe('refundErrorState', () => {
  it('frames a 501 as unsupported, keeping the API’s own message', () => {
    const error = new ApiError('Not Implemented', {
      status: 501,
      requestId: 'req-1',
      body: {
        message:
          'Use the seller-order refund endpoint to keep payment, order and ledger records consistent',
      } as never,
    });
    const state = refundErrorState(error);
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/^Not supported yet — /);
    expect(state.message).toContain('seller-order refund endpoint');
  });

  it('leaves any other failure as the API put it', () => {
    const error = new ApiError('Conflict', {
      status: 409,
      requestId: 'req-2',
      body: { message: 'Refund exceeds the refundable amount' } as never,
    });
    expect(refundErrorState(error).message).toBe(
      'Refund exceeds the refundable amount',
    );
  });
});

describe('describeRefund', () => {
  it('says a pending attempt needs reconciling', () => {
    expect(describeRefund(refund())).toMatch(/processing.*Reconcile/);
  });

  it('gives the provider’s reason for a failure', () => {
    expect(
      describeRefund(
        refund({ status: 'FAILED', failureReason: 'Gateway cannot refund' }),
      ),
    ).toContain('failed — Gateway cannot refund');
  });

  it('confirms a settled refund', () => {
    expect(describeRefund(refund({ status: 'SUCCEEDED' }))).toContain(
      'refunded',
    );
  });
});

describe('refundableAmount', () => {
  it('is what is left after earlier refunds, never below zero', () => {
    expect(refundableAmount({ total: 5000, refundedAmount: 1200 })).toBe(3800);
    expect(refundableAmount({ total: 5000, refundedAmount: 6000 })).toBe(0);
  });
});
