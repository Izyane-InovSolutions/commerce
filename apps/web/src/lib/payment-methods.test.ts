import { describe, expect, it } from 'vitest';

import { availablePaymentMethods, unavailableReason } from './payment-methods';

describe('availablePaymentMethods', () => {
  it('offers both mobile money and card for Kwacha orders', () => {
    expect(availablePaymentMethods('ZMW')).toEqual(['mobile-money', 'card']);
  });

  // Orders are only ever priced in ZMW; the gateway converts to the card
  // connector's settlement currency itself, so nothing else is payable.
  it('offers nothing for a currency orders are never priced in', () => {
    expect(availablePaymentMethods('USD')).toEqual([]);
    expect(availablePaymentMethods('EUR')).toEqual([]);
  });
});

describe('unavailableReason', () => {
  it('names the currency the shopper is actually being asked about', () => {
    expect(unavailableReason('card', 'USD')).toContain('ZMW');
    expect(unavailableReason('card', 'USD')).toContain('USD');
    expect(unavailableReason('mobile-money', 'USD')).toContain('ZMW');
  });
});
