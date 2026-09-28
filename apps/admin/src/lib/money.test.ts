import { describe, expect, it } from 'vitest';

import { toMinor, totalsByCurrency } from './money';

describe('totalsByCurrency', () => {
  it('sums a single currency into one total', () => {
    expect(
      totalsByCurrency([
        { amount: 1250, currency: 'ZMW' },
        { amount: 750, currency: 'ZMW' },
      ]),
    ).toEqual([{ currency: 'ZMW', amount: 2000 }]);
  });

  it('keeps each currency separate rather than adding across them', () => {
    expect(
      totalsByCurrency([
        { amount: 1000, currency: 'ZMW' },
        { amount: 500, currency: 'USD' },
        { amount: 250, currency: 'ZMW' },
      ]),
    ).toEqual([
      { currency: 'USD', amount: 500 },
      { currency: 'ZMW', amount: 1250 },
    ]);
  });

  it('treats currency codes case-insensitively', () => {
    expect(
      totalsByCurrency([
        { amount: 100, currency: 'zmw' },
        { amount: 100, currency: 'ZMW' },
      ]),
    ).toEqual([{ currency: 'ZMW', amount: 200 }]);
  });

  it('returns nothing for no rows', () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});

describe('toMinor', () => {
  it('parses a typed amount into minor units', () => {
    expect(toMinor('123.45')).toBe(12345);
    expect(toMinor('1,000')).toBe(100000);
  });

  it('reports an unparseable amount as NaN', () => {
    expect(toMinor('abc')).toBeNaN();
  });
});
