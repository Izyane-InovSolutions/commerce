import { describe, expect, it } from 'vitest';

import { getCartTotal, resolveCartLines } from './cart';

describe('resolveCartLines', () => {
  it('computes a line total for each item', () => {
    const lines = resolveCartLines([
      { slug: 'a', name: 'A', unitPrice: 10, quantity: 2 },
      { slug: 'b', name: 'B', unitPrice: 5, quantity: 3 },
    ]);

    expect(lines).toEqual([
      { slug: 'a', name: 'A', unitPrice: 10, quantity: 2, lineTotal: 20 },
      { slug: 'b', name: 'B', unitPrice: 5, quantity: 3, lineTotal: 15 },
    ]);
  });
});

describe('getCartTotal', () => {
  it('sums line totals', () => {
    const lines = resolveCartLines([
      { slug: 'a', name: 'A', unitPrice: 10, quantity: 2 },
      { slug: 'b', name: 'B', unitPrice: 5, quantity: 3 },
    ]);

    expect(getCartTotal(lines)).toBe(35);
  });

  it('returns 0 for no lines', () => {
    expect(getCartTotal([])).toBe(0);
  });
});
