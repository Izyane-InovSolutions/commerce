import { BadRequestException } from '@nestjs/common';
import type { OfferFulfillmentMode } from '@prisma/client';

import type { ShippingRateProvider } from './shipping-rate.provider';
import { ShippingService, type ShippingLine } from './shipping.service';

function line(
  offerId: string,
  fulfillmentMode: OfferFulfillmentMode,
  amount: number,
): ShippingLine {
  return {
    id: `cart-${offerId}`,
    offerId,
    sellerId: 'seller-1',
    fulfillmentMode,
    quantity: 1,
    unitPrice: { amount, currency: 'ZMW' },
    lineTotal: amount,
    isAvailable: true,
    currencies: ['ZMW'],
  };
}

describe('ShippingService', () => {
  const rates = { quote: jest.fn() };
  const service = new ShippingService(rates as ShippingRateProvider);

  beforeEach(() => {
    jest.resetAllMocks();
    rates.quote.mockImplementation(
      ({ fulfillmentMode }: { fulfillmentMode: OfferFulfillmentMode }) =>
        Promise.resolve({
          serviceLevel: 'STANDARD',
          rateCode: `${fulfillmentMode}_STANDARD`,
          amount: fulfillmentMode === 'SELLER' ? 500 : 250,
        }),
    );
  });

  it('groups deterministically by fulfillment mode and snapshots totals', async () => {
    const groups = await service.quoteSellerGroups(
      'seller-1',
      [line('offer-b', 'SELLER', 2000), line('offer-a', 'PLATFORM', 1000)],
      'ZM',
      'ZMW',
    );

    expect(groups.map((group) => group.fulfillmentMode)).toEqual([
      'PLATFORM',
      'SELLER',
    ]);
    expect(groups).toEqual([
      expect.objectContaining({
        fulfillmentMode: 'PLATFORM',
        subtotal: 1000,
        shippingAmount: 250,
        total: 1250,
      }),
      expect.objectContaining({
        fulfillmentMode: 'SELLER',
        subtotal: 2000,
        shippingAmount: 500,
        total: 2500,
      }),
    ]);
  });

  it('rejects a rate that cannot be represented safely in minor units', async () => {
    rates.quote.mockResolvedValue({
      serviceLevel: 'STANDARD',
      rateCode: 'INVALID',
      amount: -1,
    });

    await expect(
      service.quoteSellerGroups(
        'seller-1',
        [line('offer-a', 'SELLER', 1000)],
        'ZM',
        'ZMW',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
