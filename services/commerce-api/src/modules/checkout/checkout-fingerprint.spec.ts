import { ConfigService } from '@nestjs/config';

import type { PaymentDetailsDto } from '../payments/dto/payment-details.dto';
import {
  CHECKOUT_FINGERPRINT_VERSION,
  CheckoutFingerprintService,
  canonicalJson,
  normalizeBuyNowCheckout,
  normalizeCartCheckout,
} from './checkout-fingerprint';

const KEY_V1 = Buffer.alloc(32, 1).toString('base64');
const KEY_V2 = Buffer.alloc(40, 2).toString('base64');

function fingerprints(
  activeKeyId: string,
  keys: Record<string, string>,
): CheckoutFingerprintService {
  const env: Record<string, string> = {
    CHECKOUT_FINGERPRINT_ACTIVE_KEY_ID: activeKeyId,
    CHECKOUT_FINGERPRINT_KEYS: JSON.stringify(keys),
  };
  return new CheckoutFingerprintService({
    getOrThrow: (name: string) => env[name],
  } as unknown as ConfigService);
}

const card = {
  paymentMethod: 'CARD',
  card: { number: '4111111111111111', securityCode: '123' },
} as unknown as PaymentDetailsDto;

const cartRequest = normalizeCartCheckout({
  shippingAddressId: 'ADDR-1',
  currency: 'ZMW',
  itemIds: ['B', 'a', 'b'],
  paymentDetails: card,
});

describe('canonicalJson', () => {
  it('sorts object keys at every depth, drops undefined and keeps array order', () => {
    expect(
      canonicalJson({ b: [3, 1, { d: 1, c: undefined }], a: null, z: 'x' }),
    ).toBe('{"a":null,"b":[3,1,{"d":1}],"z":"x"}');
  });
});

describe('normalization', () => {
  it('lowercases ids and dedupes and sorts selected cart lines', () => {
    expect(cartRequest).toEqual({
      operation: 'cart',
      shippingAddressId: 'addr-1',
      currency: 'ZMW',
      itemIds: ['a', 'b'],
      paymentDetails: card,
    });
  });

  it('keeps "whole cart" distinct from an explicit empty selection', () => {
    const service = fingerprints('v1', { v1: KEY_V1 });
    const whole = normalizeCartCheckout({
      shippingAddressId: 'a',
      currency: 'ZMW',
    });
    const empty = normalizeCartCheckout({
      shippingAddressId: 'a',
      currency: 'ZMW',
      itemIds: [],
    });

    expect(whole.itemIds).toBeNull();
    expect(empty.itemIds).toEqual([]);
    expect(service.compute(whole).fingerprint).not.toBe(
      service.compute(empty).fingerprint,
    );
  });
});

describe('CheckoutFingerprintService', () => {
  it('signs with the active key and never exposes the request', () => {
    const fingerprint = fingerprints('v1', { v1: KEY_V1 }).compute(cartRequest);

    expect(fingerprint).toEqual({
      keyId: 'v1',
      version: CHECKOUT_FINGERPRINT_VERSION,
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
    expect(fingerprint.fingerprint).not.toContain('4111');
  });

  it('is a keyed HMAC: the same request under another key differs', () => {
    expect(
      fingerprints('v1', { v1: KEY_V1 }).compute(cartRequest).fingerprint,
    ).not.toBe(
      fingerprints('v1', { v1: KEY_V2 }).compute(cartRequest).fingerprint,
    );
  });

  it('matches the same request and distinguishes payment details', () => {
    const service = fingerprints('v1', { v1: KEY_V1 });
    const { keyId, version, fingerprint } = service.compute(cartRequest);
    const receipt = {
      fingerprint,
      fingerprintKeyId: keyId,
      fingerprintVersion: version,
    };

    expect(service.verify(receipt, { ...cartRequest })).toBe('match');
    expect(
      service.verify(receipt, {
        ...cartRequest,
        paymentDetails: {
          ...card,
          card: { ...card.card, securityCode: '124' },
        } as PaymentDetailsDto,
      }),
    ).toBe('mismatch');
    expect(
      service.verify(
        receipt,
        normalizeBuyNowCheckout({
          offerId: 'o',
          quantity: 1,
          shippingAddressId: 'addr-1',
          currency: 'ZMW',
        }),
      ),
    ).toBe('mismatch');
  });

  it('still verifies receipts signed before a rotation while the old key stays in the ring', () => {
    const before = fingerprints('v1', { v1: KEY_V1 }).compute(cartRequest);
    const after = fingerprints('v2', { v1: KEY_V1, v2: KEY_V2 });
    const receipt = {
      fingerprint: before.fingerprint,
      fingerprintKeyId: before.keyId,
      fingerprintVersion: before.version,
    };

    expect(after.verify(receipt, cartRequest)).toBe('match');
    expect(after.compute(cartRequest).keyId).toBe('v2');
  });

  it.each([
    ['legacy receipts without metadata', null, null],
    ['receipts signed with a key no longer in the ring', 'retired', 1],
    ['receipts of another fingerprint version', 'v1', 2],
  ])('treats %s as incomparable', (_case, keyId, version) => {
    const service = fingerprints('v1', { v1: KEY_V1 });

    expect(
      service.verify(
        {
          fingerprint: service.compute(cartRequest).fingerprint,
          fingerprintKeyId: keyId,
          fingerprintVersion: version,
        },
        cartRequest,
      ),
    ).toBe('incomparable');
  });
});
