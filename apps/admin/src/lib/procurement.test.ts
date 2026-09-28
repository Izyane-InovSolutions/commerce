import { describe, expect, it } from 'vitest';

import type {
  BackendPurchaseOrderLine,
  BackendPurchaseOrderStatus,
} from '@commerce/contracts';

import type { FormRow } from './form-rows';
import {
  basisPointsToPercent,
  computeLineAmounts,
  computeOrderTotals,
  isClosedPurchaseOrder,
  outstandingQuantity,
  parsePurchaseOrderHeader,
  parsePurchaseOrderLines,
  parseReceiptLines,
  percentToBasisPoints,
  purchaseOrderActions,
  receiptProgress,
  supplierCreateInput,
  supplierUpdateInput,
  variantDirectory,
  variantOptions,
} from './procurement';

const VARIANT = '0b6d6a4e-7f38-4e0c-9d8e-1f1f5b1c2a01';

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) {
    data.append(key, value);
  }
  return data;
}

function row(index: number, fields: Record<string, string>): FormRow {
  return { index, fields };
}

function poLine(
  overrides: Partial<BackendPurchaseOrderLine> = {},
): BackendPurchaseOrderLine {
  return {
    id: 'line-1',
    purchaseOrderId: 'po-1',
    variantId: VARIANT,
    supplierSku: null,
    packSize: 1,
    orderedQuantity: 10,
    receivedQuantity: 0,
    cancelledQuantity: 0,
    unitCostAmount: 500,
    discountAmount: 0,
    taxRateBasisPoints: 0,
    taxAmount: 0,
    netAmount: 5000,
    grossAmount: 5000,
    currency: 'ZMW',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeLineAmounts', () => {
  // The same cases as the API's purchase-order-math spec, so the preview on
  // the form and the amounts the API saves can't drift apart unnoticed.
  it('computes net, tax, and gross like the API', () => {
    expect(
      computeLineAmounts({
        orderedQuantity: 10,
        unitCostAmount: 500,
        discountAmount: 200,
        taxRateBasisPoints: 1600,
      }),
    ).toEqual({ netAmount: 4800, taxAmount: 768, grossAmount: 5568 });
  });

  it('rounds tax to the nearest minor unit', () => {
    expect(
      computeLineAmounts({
        orderedQuantity: 1,
        unitCostAmount: 999,
        discountAmount: 0,
        taxRateBasisPoints: 1650,
      }).taxAmount,
    ).toBe(165);
  });
});

describe('computeOrderTotals', () => {
  it('sums the lines and adds shipping once, untaxed', () => {
    expect(
      computeOrderTotals(
        [
          { netAmount: 1000, taxAmount: 160 },
          { netAmount: 2000, taxAmount: 320 },
        ],
        500,
      ),
    ).toEqual({ subtotalAmount: 3000, taxAmount: 480, totalAmount: 3980 });
  });
});

describe('percentToBasisPoints / basisPointsToPercent', () => {
  it('converts up to two decimals between 0 and 100', () => {
    expect(percentToBasisPoints('16')).toBe(1600);
    expect(percentToBasisPoints(' 16.5 ')).toBe(1650);
    expect(percentToBasisPoints('0.01')).toBe(1);
    expect(percentToBasisPoints('100')).toBe(10000);
  });

  it('refuses more decimals, negatives, and anything over 100', () => {
    for (const value of ['16.555', '-1', '100.01', '', 'x']) {
      expect(percentToBasisPoints(value)).toBeNaN();
    }
  });

  it('turns basis points back into a percent', () => {
    expect(basisPointsToPercent(1650)).toBe('16.5');
    expect(basisPointsToPercent(0)).toBe('0');
  });
});

describe('outstandingQuantity / receiptProgress', () => {
  it('is what is neither received nor cancelled, never negative', () => {
    expect(
      outstandingQuantity({
        orderedQuantity: 10,
        receivedQuantity: 3,
        cancelledQuantity: 2,
      }),
    ).toBe(5);
    expect(
      outstandingQuantity({
        orderedQuantity: 10,
        receivedQuantity: 12,
        cancelledQuantity: 0,
      }),
    ).toBe(0);
  });

  it('totals every line', () => {
    expect(
      receiptProgress([
        poLine({ orderedQuantity: 10, receivedQuantity: 4 }),
        poLine({ id: 'line-2', orderedQuantity: 5, cancelledQuantity: 5 }),
      ]),
    ).toEqual({ ordered: 15, received: 4, cancelled: 5, outstanding: 6 });
  });
});

describe('parsePurchaseOrderLines', () => {
  it('converts major units and percents into the API shape', () => {
    expect(
      parsePurchaseOrderLines([
        row(0, {
          variantId: VARIANT,
          orderedQuantity: '3',
          unitCost: '12.50',
          discount: '1',
          taxPercent: '16',
          packSize: '6',
          supplierSku: ' ACME-1 ',
        }),
      ]),
    ).toEqual({
      lines: [
        {
          variantId: VARIANT,
          supplierSku: 'ACME-1',
          packSize: 6,
          orderedQuantity: 3,
          unitCostAmount: 1250,
          discountAmount: 100,
          taxRateBasisPoints: 1600,
        },
      ],
      fieldErrors: {},
      formError: undefined,
    });
  });

  it('skips blank rows, and asks for a line when every row is blank', () => {
    expect(
      parsePurchaseOrderLines([row(0, {}), row(1, { discount: '' })]),
    ).toEqual({
      lines: [],
      fieldErrors: {},
      formError: 'Add at least one line.',
    });
  });

  it('keys each error to the row index it was posted under', () => {
    const { lines, fieldErrors, formError } = parsePurchaseOrderLines([
      row(4, { orderedQuantity: '0', unitCost: '-1', taxPercent: '101' }),
    ]);
    expect(lines).toEqual([]);
    expect(formError).toBeUndefined();
    expect(Object.keys(fieldErrors).sort()).toEqual([
      'lines.4.orderedQuantity',
      'lines.4.taxPercent',
      'lines.4.unitCost',
      'lines.4.variantId',
    ]);
  });

  it('refuses a discount larger than the line', () => {
    const { fieldErrors } = parsePurchaseOrderLines([
      row(0, {
        variantId: VARIANT,
        orderedQuantity: '1',
        unitCost: '5',
        discount: '6',
      }),
    ]);
    expect(fieldErrors['lines.0.discount']).toHaveLength(1);
  });
});

describe('parseReceiptLines', () => {
  const staff = { canAuthorizeExcess: false };
  const admin = { canAuthorizeExcess: true };

  it('derives delivered from accepted, rejected, and damaged', () => {
    expect(
      parseReceiptLines(
        [
          row(0, {
            purchaseOrderLineId: 'line-1',
            acceptedQuantity: '6',
            rejectedQuantity: '1',
            damagedQuantity: '1',
            discrepancyReason: 'Crushed boxes',
          }),
        ],
        [poLine()],
        staff,
      ).lines,
    ).toEqual([
      {
        purchaseOrderLineId: 'line-1',
        deliveredQuantity: 8,
        acceptedQuantity: 6,
        rejectedQuantity: 1,
        damagedQuantity: 1,
        authorizedExcessQty: undefined,
        discrepancyReason: 'Crushed boxes',
      },
    ]);
  });

  it('skips lines that received nothing, and asks for one when all did', () => {
    expect(
      parseReceiptLines(
        [row(0, { purchaseOrderLineId: 'line-1' })],
        [poLine()],
        staff,
      ),
    ).toEqual({
      lines: [],
      fieldErrors: {},
      formError: 'Enter a quantity against at least one line.',
    });
  });

  it('requires a reason for rejected or damaged stock', () => {
    const { fieldErrors } = parseReceiptLines(
      [row(0, { purchaseOrderLineId: 'line-1', damagedQuantity: '1' })],
      [poLine()],
      staff,
    );
    expect(fieldErrors['receipt.0.discrepancyReason']).toHaveLength(1);
  });

  it('refuses an over-receipt unless an administrator authorizes it', () => {
    const over = row(0, {
      purchaseOrderLineId: 'line-1',
      acceptedQuantity: '12',
      discrepancyReason: 'Supplier sent extra',
    });
    const lines = [poLine({ receivedQuantity: 0, orderedQuantity: 10 })];

    expect(
      parseReceiptLines([over], lines, admin).fieldErrors[
        'receipt.0.acceptedQuantity'
      ],
    ).toHaveLength(1);

    const authorized = row(0, { ...over.fields, authorizeExcess: 'on' });
    expect(
      parseReceiptLines([authorized], lines, staff).fieldErrors[
        'receipt.0.acceptedQuantity'
      ],
    ).toEqual(['Only an administrator can authorize an over-receipt.']);
    expect(
      parseReceiptLines([authorized], lines, admin).lines[0],
    ).toMatchObject({
      acceptedQuantity: 12,
      authorizedExcessQty: 2,
    });
  });

  it('flags a row whose purchase-order line has gone', () => {
    const { fieldErrors } = parseReceiptLines(
      [row(2, { purchaseOrderLineId: 'gone', acceptedQuantity: '1' })],
      [poLine()],
      staff,
    );
    expect(fieldErrors['receipt.2.acceptedQuantity']).toHaveLength(1);
  });
});

describe('purchaseOrderActions', () => {
  const admin = { id: 'admin-1', role: 'ADMIN' as const };
  const staff = { id: 'staff-1', role: 'STAFF' as const };
  const none = { hasPostedReceipts: false };

  function actionsFor(
    status: BackendPurchaseOrderStatus,
    viewer: { id: string; role: 'ADMIN' | 'STAFF' } = admin,
    options = none,
  ) {
    return purchaseOrderActions(
      { status, createdByUserId: 'someone-else' },
      viewer,
      options,
    );
  }

  it('offers only what each status allows, like the API state machine', () => {
    const names = (status: BackendPurchaseOrderStatus) =>
      actionsFor(status).map((entry) => entry.action);
    expect(names('DRAFT')).toEqual(['edit', 'submit', 'cancel']);
    expect(names('SUBMITTED')).toEqual(['approve', 'reject', 'returnToDraft']);
    expect(names('APPROVED')).toEqual(['place', 'revise', 'cancel']);
    expect(names('ORDERED')).toEqual(['receive', 'revise', 'cancel']);
    expect(names('PARTIALLY_RECEIVED')).toEqual(['receive', 'closeShort']);
    for (const status of [
      'REJECTED',
      'RECEIVED',
      'CLOSED_SHORT',
      'CANCELLED',
    ] as const) {
      expect(names(status)).toEqual([]);
      expect(isClosedPurchaseOrder(status)).toBe(true);
    }
    expect(isClosedPurchaseOrder('DRAFT')).toBe(false);
  });

  it('blocks approve and reject for staff', () => {
    const blocked = actionsFor('SUBMITTED', staff).filter(
      (entry) => entry.blockedReason,
    );
    expect(blocked.map((entry) => entry.action)).toEqual(['approve', 'reject']);
  });

  it('blocks approving your own purchase order, but not rejecting it', () => {
    const own = purchaseOrderActions(
      { status: 'SUBMITTED', createdByUserId: admin.id },
      admin,
      none,
    );
    expect(
      own.find((entry) => entry.action === 'approve')?.blockedReason,
    ).toBeDefined();
    expect(
      own.find((entry) => entry.action === 'reject')?.blockedReason,
    ).toBeUndefined();
  });

  it('blocks cancelling once stock has been received against it', () => {
    const cancel = actionsFor('ORDERED', admin, {
      hasPostedReceipts: true,
    }).find((entry) => entry.action === 'cancel');
    expect(cancel?.blockedReason).toBeDefined();
  });
});

describe('parsePurchaseOrderHeader', () => {
  it('reads the order fields, shipping in major units', () => {
    expect(
      parsePurchaseOrderHeader(
        form([
          ['supplierId', 's'],
          ['warehouseId', 'w'],
          ['currency', 'zmw'],
          ['shipping', '12.34'],
          ['expectedDeliveryDate', '2026-10-01'],
          ['notes', ' Call ahead '],
        ]),
      ),
    ).toEqual({
      header: {
        supplierId: 's',
        warehouseId: 'w',
        currency: 'ZMW',
        shippingAmount: 1234,
        expectedDeliveryDate: '2026-10-01',
        notes: 'Call ahead',
      },
      fieldErrors: {},
    });
  });

  it('treats blank shipping as zero and blank notes as an empty string', () => {
    const { header } = parsePurchaseOrderHeader(
      form([
        ['supplierId', 's'],
        ['warehouseId', 'w'],
        ['currency', 'ZMW'],
      ]),
    );
    expect(header.shippingAmount).toBe(0);
    expect(header.notes).toBe('');
    expect(header.expectedDeliveryDate).toBeUndefined();
  });

  it('flags missing choices, bad shipping, and impossible dates', () => {
    const { fieldErrors } = parsePurchaseOrderHeader(
      form([
        ['shipping', '-1'],
        ['expectedDeliveryDate', '2026-02-30'],
      ]),
    );
    expect(Object.keys(fieldErrors).sort()).toEqual([
      'currency',
      'expectedDeliveryDate',
      'shipping',
      'supplierId',
      'warehouseId',
    ]);
  });
});

describe('supplierCreateInput', () => {
  it('uppercases the code and pairs the minimum order with the currency', () => {
    expect(
      supplierCreateInput(
        form([
          ['code', 'acme-01'],
          ['legalName', ' Acme Ltd '],
          ['tradingName', ''],
          ['contactEmail', 'buy@acme.test'],
          ['defaultCurrency', 'ZMW'],
          ['paymentTermsDays', '30'],
          ['leadTimeDays', ''],
          ['minimumOrderAmount', '1,000.50'],
        ]),
      ),
    ).toEqual({
      input: {
        code: 'ACME-01',
        legalName: 'Acme Ltd',
        tradingName: undefined,
        registrationNumber: undefined,
        taxNumber: undefined,
        contactEmail: 'buy@acme.test',
        contactPhone: undefined,
        defaultCurrency: 'ZMW',
        paymentTermsDays: 30,
        leadTimeDays: undefined,
        minimumOrderAmount: 100050,
        minimumOrderCurrency: 'ZMW',
        notes: undefined,
      },
      fieldErrors: {},
    });
  });

  it('flags a bad code, a missing name, a bad email, and fractional days', () => {
    const { fieldErrors } = supplierCreateInput(
      form([
        ['code', 'ACME 01'],
        ['contactEmail', 'nope'],
        ['defaultCurrency', 'ZMW'],
        ['leadTimeDays', '2.5'],
      ]),
    );
    expect(Object.keys(fieldErrors).sort()).toEqual([
      'code',
      'contactEmail',
      'leadTimeDays',
      'legalName',
    ]);
  });
});

describe('supplierUpdateInput', () => {
  it('sends cleared text as an empty string, and the rendered version', () => {
    const { input, fieldErrors } = supplierUpdateInput(
      form([
        ['legalName', 'Acme Ltd'],
        ['tradingName', ''],
        ['contactEmail', ''],
        ['minimumOrderAmount', '5'],
      ]),
      { version: 7, defaultCurrency: 'ZMW' },
    );
    expect(fieldErrors).toEqual({});
    expect(input).toMatchObject({
      version: 7,
      legalName: 'Acme Ltd',
      tradingName: '',
      notes: '',
      minimumOrderAmount: 500,
      minimumOrderCurrency: 'ZMW',
    });
    expect(input.contactEmail).toBeUndefined();
  });
});

describe('variantDirectory / variantOptions', () => {
  const products = [
    {
      name: 'Tee',
      variants: [
        { id: 'v-live', skuCode: 'TEE-L', status: 'PUBLISHED' },
        { id: 'v-old', skuCode: 'TEE-OLD', status: 'ARCHIVED' },
      ],
    },
    {
      name: 'Apron',
      variants: [{ id: 'v-apron', skuCode: 'APR-1', status: 'DRAFT' }],
    },
  ] as unknown as Parameters<typeof variantDirectory>[0];

  it('labels every variant but offers only unarchived ones, sorted', () => {
    const directory = variantDirectory(products);
    expect(directory.get('v-old')).toEqual({
      product: 'Tee',
      sku: 'TEE-OLD',
      archived: true,
    });
    expect(variantOptions(directory)).toEqual([
      { value: 'v-apron', label: 'Apron — APR-1' },
      { value: 'v-live', label: 'Tee — TEE-L' },
    ]);
  });

  it('keeps an archived variant a draft already uses', () => {
    expect(
      variantOptions(variantDirectory(products), ['v-old']).map(
        (option) => option.value,
      ),
    ).toContain('v-old');
  });
});
