import { describe, expect, it } from 'vitest';

import {
  getBestSale,
  getOfferSale,
  type Product,
  type ProductOffer,
} from './catalog-types';

function offer(
  id: string,
  amount: number,
  was: number | null,
  inStock = true,
): ProductOffer {
  return {
    id,
    status: 'PUBLISHED',
    currentPrice: { amount, currency: 'ZMW' },
    compareAtPrice: was === null ? null : { amount: was, currency: 'ZMW' },
    saleEndsAt: was === null ? null : '2026-10-05T21:59:59.000Z',
    currencies: ['ZMW'],
    inStock,
    shippingCost: null,
  };
}

function product(offers: ProductOffer[][]): Product {
  return {
    id: 'p',
    name: 'Phone',
    slug: 'phone',
    description: null,
    status: 'PUBLISHED',
    brand: null,
    category: null,
    media: [],
    variants: offers.map((variantOffers, index) => ({
      id: `v${index}`,
      skuCode: `V${index}`,
      name: null,
      offers: variantOffers,
    })),
  } as unknown as Product;
}

describe('getOfferSale', () => {
  it('rounds the saving down so it never overstates it', () => {
    expect(getOfferSale(offer('o', 2_999_900, 3_299_900))).toMatchObject({
      percentOff: 9,
      was: { amount: 3_299_900 },
      endsAt: '2026-10-05T21:59:59.000Z',
    });
  });

  it('is not a sale without a higher "was" price', () => {
    expect(getOfferSale(offer('o', 100, null))).toBeNull();
    expect(getOfferSale(offer('o', 100, 100))).toBeNull();
    // Older APIs don't send the field at all.
    const legacy: Partial<ProductOffer> = offer('o', 100, 200);
    delete legacy.compareAtPrice;
    expect(getOfferSale(legacy as ProductOffer)).toBeNull();
  });
});

describe('getBestSale', () => {
  it('picks the biggest in-stock saving across variants', () => {
    const best = getBestSale(
      product([
        [offer('small', 90, 100)],
        [offer('big-sold-out', 50, 100, false)],
        [offer('big', 70, 100)],
      ]),
    );
    expect(best?.offer.id).toBe('big');
    expect(best?.percentOff).toBe(30);
  });

  it('is null when nothing is on sale', () => {
    expect(getBestSale(product([[offer('o', 100, null)]]))).toBeNull();
  });
});
