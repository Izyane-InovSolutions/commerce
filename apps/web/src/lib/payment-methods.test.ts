import { describe, expect, it } from 'vitest';

import {
  availablePaymentMethods,
  detectMobileNetwork,
  unavailableReason,
} from './payment-methods';

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

describe('detectMobileNetwork', () => {
  it('recognises MTN prefixes', () => {
    expect(detectMobileNetwork('096 123 4567')).toBe('MTN');
    expect(detectMobileNetwork('0761234567')).toBe('MTN');
  });

  it('recognises Airtel prefixes', () => {
    expect(detectMobileNetwork('097 123 4567')).toBe('AIRTEL');
    expect(detectMobileNetwork('0771234567')).toBe('AIRTEL');
  });

  it('returns null for a prefix neither carrier uses', () => {
    expect(detectMobileNetwork('095 123 4567')).toBeNull();
  });

  it('returns null before three digits have been typed', () => {
    expect(detectMobileNetwork('09')).toBeNull();
    expect(detectMobileNetwork('')).toBeNull();
  });
});
