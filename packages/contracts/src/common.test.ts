import { describe, expect, it } from 'vitest';

import { formatMoney, money, parseMoneyInput } from './common.ts';

describe('money', () => {
  it('formats minor units as a currency amount', () => {
    expect(formatMoney(money(1250))).toBe('£12.50');
    expect(formatMoney(money(0))).toBe('£0.00');
    expect(formatMoney(money(199999))).toBe('£1,999.99');
  });

  it('parses a decimal amount into minor units', () => {
    expect(parseMoneyInput('12.50')).toEqual(money(1250));
    expect(parseMoneyInput('12.5')).toEqual(money(1250));
    expect(parseMoneyInput('12')).toEqual(money(1200));
    expect(parseMoneyInput(' 7.05 ')).toEqual(money(705));
  });

  it('rounds rather than truncating at the minor unit', () => {
    expect(parseMoneyInput('0.07')).toEqual(money(7));
    expect(parseMoneyInput('1.10')).toEqual(money(110));
  });

  it('rejects input that is not a plain decimal amount', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('12.505')).toBeNull();
    expect(parseMoneyInput('-5')).toBeNull();
    expect(parseMoneyInput('£12.50')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
});
