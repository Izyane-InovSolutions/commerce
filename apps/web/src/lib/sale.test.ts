import { describe, expect, it } from 'vitest';

import {
  describeLeadRivals,
  getBestDeal,
  getOfferSale,
  getPriceSummary,
  getVariantOffer,
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

describe('getBestDeal', () => {
  it('picks the biggest in-stock saving across variants', () => {
    const best = getBestDeal(
      product([
        [offer('small', 90, 100)],
        [offer('big-sold-out', 50, 100, false)],
        [offer('big', 70, 100)],
      ]),
    );
    expect(best).toMatchObject({ kind: 'sale', percentOff: 30 });
    expect(best?.offer.id).toBe('big');
  });

  it('counts a best price, compared with the next seller and never as a "was"', () => {
    const lead: ProductOffer = {
      ...offer('cheap', 9_000, null),
      priceLead: {
        nextLowestPrice: { amount: 10_000, currency: 'ZMW' },
        sellerCount: 3,
      },
    };
    expect(
      getBestDeal(product([[lead, offer('dear', 10_000, null)]])),
    ).toMatchObject({
      kind: 'lead',
      percentOff: 10,
      compareWith: { amount: 10_000 },
      sellerCount: 3,
      endsAt: null,
    });
  });

  it('is null when nothing is on sale', () => {
    expect(getBestDeal(product([[offer('o', 100, null)]]))).toBeNull();
  });
});

describe('getVariantOffer', () => {
  it('leads with the cheapest in-stock offer, whatever the API order', () => {
    const [variant] = product([
      [
        offer('dear', 12_000, null),
        offer('cheapest-sold-out', 8_000, null, false),
        offer('cheap', 10_000, null),
      ],
    ]).variants;
    expect(getVariantOffer(variant!)?.id).toBe('cheap');
  });

  it('falls back to the cheapest priced offer when all are out of stock', () => {
    const [variant] = product([
      [offer('a', 12_000, null, false), offer('b', 9_000, null, false)],
    ]).variants;
    expect(getVariantOffer(variant!)?.id).toBe('b');
  });
});

describe('getPriceSummary', () => {
  it('finds the lowest price across variants and counts the stores', () => {
    const withSeller = (id: string, amount: number, seller: string | null) => ({
      ...offer(id, amount, null),
      seller: seller
        ? {
            id: seller,
            storefrontSlug: seller,
            displayName: seller,
            description: null,
          }
        : null,
    });
    const summary = getPriceSummary(
      product([
        [withSeller('a', 12_000, null)],
        [withSeller('b', 9_000, 'marys'), withSeller('c', 9_500, null)],
      ]),
    );
    expect(summary).toMatchObject({
      offer: { id: 'b' },
      variant: { id: 'v1' },
      varies: true,
      sellerCount: 2,
    });
  });
});

describe('describeLeadRivals', () => {
  it('names one rival plainly and several by count', () => {
    expect(describeLeadRivals(2)).toBe('less than the other seller');
    expect(describeLeadRivals(4)).toBe(
      'less than the next-cheapest of 4 sellers',
    );
  });
});
