import { describe, expect, it } from 'vitest';

import { buyNowHref, resolveBuyNowSelection } from './buy-now';
import type { Product, ProductOffer, ProductVariant } from './catalog-types';

function offer(id: string, amount: number | null): ProductOffer {
  return {
    id,
    status: 'PUBLISHED',
    currentPrice: amount === null ? null : { amount, currency: 'ZMW' },
    currencies: ['ZMW'],
    inStock: true,
    shippingCost: null,
  };
}

function variant(
  id: string,
  offers: ProductOffer[],
  name: string | null = null,
): ProductVariant {
  return { id, skuCode: `SKU-${id}`, name, offers };
}

function product(variants: ProductVariant[]): Product {
  return {
    id: 'product-1',
    name: 'Kettle',
    slug: 'kettle',
    description: null,
    category: null,
    media: [],
    variants,
  };
}

describe('resolveBuyNowSelection', () => {
  const twoVariants = product([
    variant('v-black', [offer('o-black', 5000)], 'Black'),
    variant(
      'v-red',
      [offer('o-red-unpriced', null), offer('o-red', 5500)],
      'Red',
    ),
  ]);

  it('buys the lead offer when no variant is named', () => {
    const selection = resolveBuyNowSelection(twoVariants, undefined);
    expect(selection?.offer.id).toBe('o-black');
    expect(selection?.variant.id).toBe('v-black');
    expect(selection?.price).toEqual({ amount: 5000, currency: 'ZMW' });
  });

  it("buys the named variant's own priced offer", () => {
    const selection = resolveBuyNowSelection(twoVariants, 'v-red');
    expect(selection?.offer.id).toBe('o-red');
    expect(selection?.price.amount).toBe(5500);
    expect(selection?.name).toBe('Kettle — Red');
  });

  it('refuses an unknown variant rather than buying another one', () => {
    expect(resolveBuyNowSelection(twoVariants, 'v-missing')).toBeNull();
  });

  it('refuses a variant with no priced offer', () => {
    const unpriced = product([
      variant('v-1', [offer('o-1', 1000)]),
      variant('v-2', [offer('o-2', null)]),
    ]);
    expect(resolveBuyNowSelection(unpriced, 'v-2')).toBeNull();
  });

  it('keeps the plain product name for a single-variant product', () => {
    const single = product([variant('v-1', [offer('o-1', 1000)], 'Default')]);
    expect(resolveBuyNowSelection(single, 'v-1')?.name).toBe('Kettle');
  });

  it('is null when nothing on the product is priced', () => {
    expect(
      resolveBuyNowSelection(
        product([variant('v-1', [offer('o-1', null)])]),
        undefined,
      ),
    ).toBeNull();
  });
});

describe('buyNowHref', () => {
  it('carries the quantity, and the variant when there is one', () => {
    expect(buyNowHref('kettle', 2)).toBe('/buy-now/kettle?quantity=2');
    expect(buyNowHref('kettle', 2, 'v-red')).toBe(
      '/buy-now/kettle?quantity=2&variant=v-red',
    );
  });
});
