import { describe, expect, it } from 'vitest';

import { saleEndsAt } from './sale-date';

const now = new Date('2026-09-28T10:00:00Z');

describe('saleEndsAt', () => {
  it('ends at the close of the chosen day, Lusaka time', () => {
    expect(saleEndsAt('2026-10-05', now)).toBe('2026-10-05T21:59:59.000Z');
  });

  it('treats blank as no end date', () => {
    expect(saleEndsAt('  ', now)).toBeNull();
  });

  it('accepts today, since the sale runs to midnight', () => {
    expect(saleEndsAt('2026-09-28', now)).toBe('2026-09-28T21:59:59.000Z');
  });

  it('refuses past and malformed dates', () => {
    expect(saleEndsAt('2026-09-27', now)).toBe('invalid');
    expect(saleEndsAt('5 Oct', now)).toBe('invalid');
  });
});
