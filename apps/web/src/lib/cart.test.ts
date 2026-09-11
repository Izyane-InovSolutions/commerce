import { describe, expect, it } from 'vitest';

import { getCartTotal, resolveCartLines } from './cart';

describe('resolveCartLines', () => {
  it('resolves cart items to their product details and line totals', () => {
    const lines = resolveCartLines([
      { productId: 'na-1', quantity: 2 },
      { productId: 'bs-3', quantity: 1 },
    ]);

    expect(lines).toHaveLength(2);
    const firstLine = lines[0]!;
    expect(firstLine).toMatchObject({
      quantity: 2,
      lineTotal: firstLine.product.price * 2,
    });
  });

  it('skips items whose product no longer exists', () => {
    const lines = resolveCartLines([
      { productId: 'does-not-exist', quantity: 1 },
    ]);

    expect(lines).toEqual([]);
  });
});

describe('getCartTotal', () => {
  it('sums line totals', () => {
    const lines = resolveCartLines([
      { productId: 'na-1', quantity: 2 },
      { productId: 'bs-3', quantity: 1 },
    ]);

    expect(getCartTotal(lines)).toBe(
      lines.reduce((sum, line) => sum + line.lineTotal, 0),
    );
  });

  it('returns 0 for no lines', () => {
    expect(getCartTotal([])).toBe(0);
  });
});
