import type { Price } from '@prisma/client';

import { pickCurrentPrice } from './current-price';

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
    expect(pickCurrentPrice([], now)).toBeUndefined();
  });

  it('ignores a price that has not started yet', () => {
    const future = buildPrice({ startsAt: new Date('2027-01-01T00:00:00Z') });

    expect(pickCurrentPrice([future], now)).toBeUndefined();
  });

  it('ignores a price that has already ended', () => {
    const expired = buildPrice({
      startsAt: new Date('2025-01-01T00:00:00Z'),
      endsAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(pickCurrentPrice([expired], now)).toBeUndefined();
  });

  it('returns an open-ended price that has started', () => {
    const active = buildPrice({
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: null,
    });

    expect(pickCurrentPrice([active], now)?.id).toBe('price-1');
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

    expect(pickCurrentPrice([older, newer], now)?.id).toBe('newer');
  });
});
