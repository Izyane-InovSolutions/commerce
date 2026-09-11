import { describe, expect, it } from 'vitest';

import { availablePaymentMethods, unavailableReason } from './payment-methods';

describe('availablePaymentMethods', () => {
  it('offers mobile money for Kwacha orders, and not a card', () => {
    expect(availablePaymentMethods('ZMW')).toEqual(['mobile-money']);
  });

  it('offers a card for the currencies the card connector settles in', () => {
    expect(availablePaymentMethods('USD')).toEqual(['card']);
    expect(availablePaymentMethods('GBP')).toEqual(['card']);
  });

  // The gateway routes on currency, so an order priced in anything else has
  // no way to be paid for — checkout has to say so rather than fail at the end.
  it('offers nothing for a currency neither connector takes', () => {
    expect(availablePaymentMethods('EUR')).toEqual([]);
  });
});

describe('unavailableReason', () => {
  it('names the currency the shopper is actually being asked about', () => {
    expect(unavailableReason('card', 'ZMW')).toContain('ZMW');
    expect(unavailableReason('card', 'ZMW')).toContain('USD or GBP');
    expect(unavailableReason('mobile-money', 'USD')).toContain('ZMW');
  });
});
