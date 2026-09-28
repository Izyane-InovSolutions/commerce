import type { Price } from '@prisma/client';

import { currentPrices, pickCurrentPrice, pickSale } from './current-price';

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

describe('pickSale', () => {
  const now = new Date('2026-06-15T00:00:00Z');
  const regular = buildPrice({
    id: 'regular',
    amount: 32_999_00,
    currency: 'ZMW',
  });
  const sale = buildPrice({
    id: 'sale',
    amount: 28_999_00,
    currency: 'ZMW',
    startsAt: new Date('2026-06-10T00:00:00Z'),
    endsAt: new Date('2026-06-20T00:00:00Z'),
  });

  it('reports a time-limited price that undercuts the regular one', () => {
    expect(pickSale([regular, sale], 'ZMW', now)).toMatchObject({
      current: { id: 'sale' },
      regular: { id: 'regular' },
      endsAt: sale.endsAt,
    });
  });

  it('is not a sale once the window has closed', () => {
    expect(
      pickSale([regular, sale], 'ZMW', new Date('2026-06-21T00:00:00Z')),
    ).toBeUndefined();
  });

  it('is not a sale when the current price is open-ended', () => {
    const cheaper = buildPrice({
      id: 'new',
      amount: 1,
      currency: 'ZMW',
      startsAt: new Date('2026-06-01T00:00:00Z'),
    });
    expect(pickSale([regular, cheaper], 'ZMW', now)).toBeUndefined();
  });

  it('is not a sale when the limited price is not lower', () => {
    const pricier = { ...sale, amount: 40_000_00 };
    expect(pickSale([regular, pricier], 'ZMW', now)).toBeUndefined();
  });

  it('ignores a regular price in another currency', () => {
    expect(
      pickSale([{ ...regular, currency: 'USD' }, sale], 'ZMW', now),
    ).toBeUndefined();
  });
});
