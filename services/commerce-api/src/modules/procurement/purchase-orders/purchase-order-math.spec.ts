import { computeLineAmounts, computeOrderTotals } from './purchase-order-math';

describe('computeLineAmounts', () => {
  it('computes net, tax and gross from quantity, unit cost, discount and tax rate', () => {
    const amounts = computeLineAmounts({
      orderedQuantity: 10,
      unitCostAmount: 500,
      discountAmount: 200,
      taxRateBasisPoints: 1_600,
    });

    // net = 10*500 - 200 = 4800; tax = 4800 * 0.16 = 768; gross = 5568
    expect(amounts).toEqual({ netAmount: 4_800, taxAmount: 768, grossAmount: 5_568 });
  });

  it('rounds tax to the nearest minor unit rather than truncating', () => {
    const amounts = computeLineAmounts({
      orderedQuantity: 1,
      unitCostAmount: 999,
      discountAmount: 0,
      taxRateBasisPoints: 1_650,
    });

    // 999 * 0.165 = 164.835 -> rounds to 165
    expect(amounts.taxAmount).toBe(165);
  });

  it('supports a zero tax rate', () => {
    const amounts = computeLineAmounts({
      orderedQuantity: 3,
      unitCostAmount: 100,
      discountAmount: 0,
      taxRateBasisPoints: 0,
    });

    expect(amounts).toEqual({ netAmount: 300, taxAmount: 0, grossAmount: 300 });
  });
});

describe('computeOrderTotals', () => {
  it('sums line net/tax amounts and adds shipping', () => {
    const totals = computeOrderTotals(
      [
        { netAmount: 1_000, taxAmount: 160, grossAmount: 1_160 },
        { netAmount: 2_000, taxAmount: 320, grossAmount: 2_320 },
      ],
      500,
    );

    expect(totals).toEqual({
      subtotalAmount: 3_000,
      taxAmount: 480,
      totalAmount: 3_980,
    });
  });

  it('handles an empty line list', () => {
    expect(computeOrderTotals([], 0)).toEqual({
      subtotalAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
    });
  });
});
