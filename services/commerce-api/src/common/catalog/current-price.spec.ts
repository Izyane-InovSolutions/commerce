import type { Price } from '@prisma/client';

import { currentPrices, pickCurrentPrice } from './current-price';

function buildPrice(overrides: Partial<Price>): Price {
  return {
    id: 'price-1',
    offerId: 'offer-1',
    amount: 1000,
    currency: 'USD',
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('pickCurrentPrice', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('returns undefined when there are no prices', () => {
    expect(pickCurrentPrice([], 'USD', now)).toBeUndefined();
  });

  it('ignores a price that has not started yet', () => {
    const future = buildPrice({ startsAt: new Date('2027-01-01T00:00:00Z') });

    expect(pickCurrentPrice([future], 'USD', now)).toBeUndefined();
  });

  it('ignores a price that has already ended', () => {
    const expired = buildPrice({
      startsAt: new Date('2025-01-01T00:00:00Z'),
      endsAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(pickCurrentPrice([expired], 'USD', now)).toBeUndefined();
  });

  it('returns an open-ended price that has started', () => {
    const active = buildPrice({
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: null,
    });

    expect(pickCurrentPrice([active], 'USD', now)?.id).toBe('price-1');
  });

  it('picks the most recently started price when windows overlap', () => {
    const older = buildPrice({
      id: 'older',
      startsAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newer = buildPrice({
      id: 'newer',
      startsAt: new Date('2026-03-01T00:00:00Z'),
    });

    expect(pickCurrentPrice([older, newer], 'USD', now)?.id).toBe('newer');
  });

  // The case that matters for a multi-currency catalog: adding a price in one
  // currency must not change what another currency resolves to, whichever was
  // entered last.
  it('never crosses currencies, even when the other one is newer', () => {
    const kwacha = buildPrice({
      id: 'kwacha',
      currency: 'ZMW',
      startsAt: new Date('2026-01-01T00:00:00Z'),
    });
    const pounds = buildPrice({
      id: 'pounds',
      currency: 'GBP',
      startsAt: new Date('2026-05-01T00:00:00Z'),
    });

    expect(pickCurrentPrice([kwacha, pounds], 'ZMW', now)?.id).toBe('kwacha');
    expect(pickCurrentPrice([kwacha, pounds], 'GBP', now)?.id).toBe('pounds');
    expect(pickCurrentPrice([kwacha, pounds], 'USD', now)).toBeUndefined();
  });
});

describe('currentPrices', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('returns the current ZMW price and excludes historical foreign prices', () => {
    const oldKwacha = buildPrice({
      id: 'old-kwacha',
      currency: 'ZMW',
      startsAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newKwacha = buildPrice({
      id: 'new-kwacha',
      currency: 'ZMW',
      startsAt: new Date('2026-03-01T00:00:00Z'),
    });
    const pounds = buildPrice({ id: 'pounds', currency: 'GBP' });

    const resolved = currentPrices([oldKwacha, newKwacha, pounds], now);

    expect(resolved.map((price) => price.id)).toEqual(['new-kwacha']);
  });

  it('leaves out currencies whose only price has expired', () => {
    const expired = buildPrice({
      id: 'expired',
      currency: 'GBP',
      endsAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(currentPrices([expired], now)).toEqual([]);
  });
});
