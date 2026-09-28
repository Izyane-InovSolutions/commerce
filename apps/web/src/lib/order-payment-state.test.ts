import { describe, expect, it } from 'vitest';

import type { Order, OrderPayment } from './commerce-types';
import { describePayment } from './order-payment-state';

function state(status: Order['status'], payment: Partial<OrderPayment> | null) {
  return describePayment({
    status,
    payment: payment
      ? { id: 'pay-1', status: 'PENDING', failureReason: null, ...payment }
      : null,
  });
}

describe('describePayment', () => {
  it('polls, and allows cancelling, while a payment is still pending', () => {
    expect(state('PENDING_PAYMENT', { status: 'PENDING' })).toMatchObject({
      tone: 'waiting',
      awaiting: true,
      canCancelOrder: true,
      canCancelPayment: true,
    });
  });

  it('keeps polling once the money moved, but no longer offers cancelling', () => {
    expect(state('PENDING_PAYMENT', { status: 'SUCCEEDED' })).toMatchObject({
      awaiting: true,
      canCancelOrder: false,
    });
  });

  it('stops polling on a failed payment and says why', () => {
    expect(
      state('PENDING_PAYMENT', { status: 'FAILED', failureReason: 'Declined' }),
    ).toMatchObject({
      tone: 'problem',
      detail: 'Declined',
      awaiting: false,
      canCancelOrder: true,
      canCancelPayment: false,
    });
  });

  it('settles on a paid order', () => {
    expect(state('PAID', { status: 'SUCCEEDED' })).toMatchObject({
      tone: 'success',
      title: 'Paid',
      awaiting: false,
      canCancelOrder: false,
    });
  });

  it('says nothing was charged for a cancelled order', () => {
    expect(state('CANCELLED', { status: 'CANCELLED' })).toMatchObject({
      tone: 'neutral',
      detail: 'Nothing was charged for this order.',
      canCancelOrder: false,
    });
  });
});
