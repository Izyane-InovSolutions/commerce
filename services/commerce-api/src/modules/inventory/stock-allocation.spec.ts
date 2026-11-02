import {
  MAX_INT4,
  canAllocateFirstFit,
  stockPoolKey,
} from './stock-allocation';

describe('canAllocateFirstFit', () => {
  it('serves each demand from the first record with enough stock', () => {
    expect(canAllocateFirstFit([3, 5], [3, 5])).toBe(true);
    expect(canAllocateFirstFit([3, 5], [2, 1, 5])).toBe(true);
  });

  it('never splits a demand across records', () => {
    // 4 + 4 covers 6 in total, but no single record holds 6.
    expect(canAllocateFirstFit([4, 4], [6])).toBe(false);
  });

  it('allocates in the order demands are given, like checkout does', () => {
    // First fit puts the 2 on the 5, leaving 3 for the 4: refused, although
    // the reverse order would fit.
    expect(canAllocateFirstFit([5, 2], [2, 4])).toBe(false);
    expect(canAllocateFirstFit([5, 2], [4, 2])).toBe(true);
  });

  it('refuses any positive demand against an empty pool', () => {
    expect(canAllocateFirstFit([], [1])).toBe(false);
    expect(canAllocateFirstFit([0], [1])).toBe(false);
  });

  it('accepts no demands and ignores non-positive ones', () => {
    expect(canAllocateFirstFit([], [])).toBe(true);
    expect(canAllocateFirstFit([], [0])).toBe(true);
  });

  it('does not mutate its inputs', () => {
    const available = [5];
    const demands = [3];
    canAllocateFirstFit(available, demands);
    expect(available).toEqual([5]);
    expect(demands).toEqual([3]);
  });
});

describe('stockPoolKey', () => {
  it('names offer and variant pools distinctly', () => {
    expect(stockPoolKey({ kind: 'offer', offerId: 'a' })).toBe('offer:a');
    expect(stockPoolKey({ kind: 'variant', variantId: 'a' })).toBe('variant:a');
  });
});

describe('MAX_INT4', () => {
  it('is the PostgreSQL integer maximum', () => {
    expect(MAX_INT4).toBe(2 ** 31 - 1);
  });
});
