// The decorators on these DTOs read design-time metadata, which Nest's own
// bootstrap normally provides.
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { PaymentDetailsDto } from './payment-details.dto';

/**
 * The exact payloads the storefront checkout sends.
 *
 * `UnifiedPaymentProvider.validateInput` runs this DTO with
 * `forbidNonWhitelisted`, so a field the form renames or forgets fails the
 * whole payment rather than being dropped quietly. Pinning both shapes here
 * means that breaks a test instead of a checkout.
 */
function errors(payload: unknown): string[] {
  return validateSync(plainToInstance(PaymentDetailsDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((error) => [
    error.property,
    ...(error.children ?? []).flatMap((child) => [
      child.property,
      ...(child.children ?? []).map((leaf) => leaf.property),
    ]),
  ]);
}

describe('PaymentDetailsDto', () => {
  const card = {
    paymentMethod: 'CARD',
    card: {
      number: '4111111111111111',
      expiryMonth: '12',
      expiryYear: '2031',
      securityCode: '123',
      holderName: 'John Doe',
      billing: {
        firstName: 'John',
        lastName: 'Doe',
        address1: '1 Market Street',
        locality: 'San Francisco',
        administrativeArea: 'CA',
        postalCode: '94105',
        country: 'US',
        email: 'john.doe@example.com',
      },
    },
  };

  it('accepts the card payload the checkout form builds', () => {
    expect(errors(card)).toEqual([]);
  });

  it('accepts the mobile money payload, with or without a provider', () => {
    const mobile = {
      paymentMethod: 'MOBILE_MONEY',
      phoneNumber: '0977123456',
    };

    expect(errors(mobile)).toEqual([]);
    expect(errors({ ...mobile, provider: 'AIRTEL' })).toEqual([]);
  });

  // Every billing field is required by the processor, so a form that stopped
  // collecting one has to fail loudly here rather than at the gateway.
  it.each([
    'firstName',
    'lastName',
    'address1',
    'locality',
    'administrativeArea',
    'postalCode',
    'country',
    'email',
  ])('rejects a card payload missing billing.%s', (field) => {
    const billing: Record<string, string> = { ...card.card.billing };
    delete billing[field];

    expect(errors({ ...card, card: { ...card.card, billing } })).toContain(
      field,
    );
  });

  it('rejects a two-digit expiry year, which the gateway will not take', () => {
    expect(
      errors({ ...card, card: { ...card.card, expiryYear: '31' } }),
    ).toContain('expiryYear');
  });

  it('rejects a billing country that is not a two-letter code', () => {
    const billing = { ...card.card.billing, country: 'USA' };

    expect(errors({ ...card, card: { ...card.card, billing } })).toContain(
      'country',
    );
  });
});
