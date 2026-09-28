import type {
  BackendAdminOrderItem,
  BackendFulfillmentLine,
} from '@commerce/contracts';
import { describe, expect, it } from 'vitest';

import {
  canCancelOrder,
  cancellableQuantity,
  customerName,
  describeOrderItem,
  isFulfillmentClosed,
  parseCancelLinesForm,
  parseCreateExceptionForm,
  parseResolveExceptionForm,
} from './order-operations';

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function line(
  overrides: Partial<BackendFulfillmentLine> = {},
): BackendFulfillmentLine {
  return {
    id: 'line-1',
    fulfillmentOrderId: 'fo-1',
    orderItemId: 'item-1',
    variantId: 'variant-1',
    allocatedQuantity: 5,
    pickedQuantity: 0,
    packedQuantity: 0,
    shipmentAssignedQuantity: 0,
    dispatchedQuantity: 0,
    cancelledQuantity: 0,
    ...overrides,
  };
}

function item(
  overrides: Partial<BackendAdminOrderItem> = {},
): BackendAdminOrderItem {
  return {
    id: 'item-1',
    orderId: 'order-1',
    sellerOrderId: null,
    offerId: 'abcdef12-0000-0000-0000-000000000000',
    quantity: 1,
    unitAmount: 100,
    currency: 'USD',
    lineTotal: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('canCancelOrder', () => {
  it('only allows an unpaid order', () => {
    expect(canCancelOrder('PENDING_PAYMENT')).toBe(true);
    expect(canCancelOrder('PAID')).toBe(false);
    expect(canCancelOrder('CANCELLED')).toBe(false);
  });
});

describe('isFulfillmentClosed', () => {
  it('is closed once dispatched or cancelled', () => {
    expect(isFulfillmentClosed('DISPATCHED')).toBe(true);
    expect(isFulfillmentClosed('CANCELLED')).toBe(true);
    expect(isFulfillmentClosed('ON_HOLD')).toBe(false);
    expect(isFulfillmentClosed('PARTIALLY_CANCELLED')).toBe(false);
  });
});

describe('cancellableQuantity', () => {
  it('excludes cancelled and dispatched units', () => {
    expect(
      cancellableQuantity(
        line({ cancelledQuantity: 1, dispatchedQuantity: 2 }),
      ),
    ).toBe(2);
  });

  it('never goes below zero', () => {
    expect(
      cancellableQuantity(
        line({ cancelledQuantity: 3, dispatchedQuantity: 3 }),
      ),
    ).toBe(0);
  });
});

describe('describeOrderItem', () => {
  it('prefers the listing title, then shows variant name and SKU', () => {
    expect(
      describeOrderItem(
        item({
          listingTitle: 'Seller title',
          product: { id: 'p', name: 'Product', slug: 'product' },
          variant: { id: 'v', skuCode: 'SKU-1', name: 'Blue' },
        }),
      ),
    ).toEqual({ title: 'Seller title', detail: 'Blue · SKU-1' });
  });

  it('falls back to the product name and SKU alone', () => {
    expect(
      describeOrderItem(
        item({
          listingTitle: null,
          product: { id: 'p', name: 'Product', slug: 'product' },
          variant: { id: 'v', skuCode: 'SKU-1', name: null },
        }),
      ),
    ).toEqual({ title: 'Product', detail: 'SKU-1' });
  });

  it('falls back to the offer id when the API sent no names', () => {
    expect(describeOrderItem(item())).toEqual({
      title: 'Offer abcdef12',
      detail: null,
    });
  });

  it('names a missing item rather than throwing', () => {
    expect(describeOrderItem(undefined).title).toBe('Unknown item');
  });
});

describe('customerName', () => {
  const base = { id: 'u', email: 'a@example.com', phone: null };

  it('joins first and last name', () => {
    expect(
      customerName({ ...base, firstName: 'Ada', lastName: 'Lovelace' }),
    ).toBe('Ada Lovelace');
  });

  it('falls back to the email', () => {
    expect(customerName({ ...base, firstName: null, lastName: ' ' })).toBe(
      'a@example.com',
    );
  });
});

describe('parseCreateExceptionForm', () => {
  it('parses a complete form', () => {
    expect(
      parseCreateExceptionForm(
        form({
          fulfillmentLineId: 'line-1',
          type: 'DAMAGED',
          quantity: '2',
          reason: ' Crushed box ',
        }),
      ),
    ).toEqual({
      ok: true,
      input: {
        fulfillmentLineId: 'line-1',
        type: 'DAMAGED',
        quantity: 2,
        reason: 'Crushed box',
      },
    });
  });

  it('reports every bad field', () => {
    const result = parseCreateExceptionForm(
      form({ type: 'LOST', quantity: '0', reason: '' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      'fulfillmentLineId',
      'quantity',
      'reason',
      'type',
    ]);
  });
});

describe('parseResolveExceptionForm', () => {
  it('parses the pressed action and resolution', () => {
    expect(
      parseResolveExceptionForm(
        form({ action: 'cancel_quantity', resolution: 'Unit written off' }),
      ),
    ).toEqual({
      ok: true,
      input: { action: 'cancel_quantity', resolution: 'Unit written off' },
    });
  });

  it('rejects an unknown action and a blank resolution', () => {
    const result = parseResolveExceptionForm(form({ action: 'delete' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      'action',
      'resolution',
    ]);
  });
});

describe('parseCancelLinesForm', () => {
  it('keeps only lines with a quantity', () => {
    expect(
      parseCancelLinesForm(
        form({
          'lines.0.fulfillmentLineId': 'line-1',
          'lines.0.quantity': '2',
          'lines.1.fulfillmentLineId': 'line-2',
          'lines.1.quantity': '',
          'lines.2.fulfillmentLineId': 'line-3',
          'lines.2.quantity': '0',
          reason: 'Customer asked',
        }),
      ),
    ).toEqual({
      ok: true,
      input: {
        lines: [{ fulfillmentLineId: 'line-1', quantity: 2 }],
        reason: 'Customer asked',
      },
    });
  });

  it('asks for at least one line', () => {
    const result = parseCancelLinesForm(
      form({
        'lines.0.fulfillmentLineId': 'line-1',
        'lines.0.quantity': '',
        reason: 'Customer asked',
      }),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { lines: ['Enter a quantity on at least one line.'] },
    });
  });

  it('puts a bad quantity on its own row and requires a reason', () => {
    const result = parseCancelLinesForm(
      form({
        'lines.3.fulfillmentLineId': 'line-1',
        'lines.3.quantity': '1.5',
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      'lines.3.quantity',
      'reason',
    ]);
  });
});
