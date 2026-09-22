import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ZoneShippingRateProvider } from './zone-shipping-rate.provider';

function provider(
  env: Record<string, string | number> = {},
): ZoneShippingRateProvider {
  return new ZoneShippingRateProvider(new ConfigService(env));
}

const baseRequest = {
  sellerId: null,
  fulfillmentMode: 'PLATFORM' as const,
  destinationCountry: 'ZM',
  currency: 'ZMW',
  subtotal: 10_000,
  quantity: 1,
};

describe('ZoneShippingRateProvider', () => {
  it('quotes the domestic flat rate below the free-shipping threshold', async () => {
    const rate = await provider().quote({
      ...baseRequest,
      destinationCountry: 'ZM',
      subtotal: 10_000,
    });

    expect(rate).toMatchObject({
      serviceLevel: 'STANDARD',
      rateCode: 'DOMESTIC_STANDARD_V1',
      amount: 3_000,
      estimatedDeliveryDays: { min: 2, max: 5 },
    });
    expect(rate.quoteId).toEqual(expect.any(String));
    expect(rate.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('is free at or above the domestic free-shipping threshold', async () => {
    const rate = await provider().quote({
      ...baseRequest,
      destinationCountry: 'ZM',
      subtotal: 50_000,
    });

    expect(rate).toMatchObject({
      rateCode: 'DOMESTIC_STANDARD_FREE_V1',
      amount: 0,
    });
  });

  it('quotes the international flat rate for a non-domestic destination, regardless of subtotal', async () => {
    const rate = await provider().quote({
      ...baseRequest,
      destinationCountry: 'US',
      subtotal: 1_000_000,
    });

    expect(rate).toMatchObject({
      serviceLevel: 'STANDARD',
      rateCode: 'INTERNATIONAL_STANDARD_V1',
      amount: 15_000,
      estimatedDeliveryDays: { min: 7, max: 14 },
    });
  });

  it('is case-insensitive and normalizes the destination for the domestic/international split', async () => {
    const rate = await provider().quote({
      ...baseRequest,
      destinationCountry: 'zm',
    });

    expect(rate.rateCode).toBe('DOMESTIC_STANDARD_V1');
  });

  it('rejects a destination that is not a 2-letter ISO code', async () => {
    await expect(
      provider().quote({ ...baseRequest, destinationCountry: 'USA' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a destination on the configured unsupported list', async () => {
    await expect(
      provider({ SHIPPING_UNSUPPORTED_COUNTRIES: 'KP, IR' }).quote({
        ...baseRequest,
        destinationCountry: 'kp',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('honors configured rate and threshold overrides', async () => {
    const rate = await provider({
      SHIPPING_DOMESTIC_RATE_MINOR: 500,
      SHIPPING_DOMESTIC_FREE_THRESHOLD_MINOR: 2_000,
    }).quote({ ...baseRequest, destinationCountry: 'ZM', subtotal: 1_000 });

    expect(rate.amount).toBe(500);
  });
});
