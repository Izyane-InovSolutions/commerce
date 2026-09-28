import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TrendingHero } from './trending-hero';
import type { Product } from '@/lib/catalog-types';

function buildProduct(index: number): Product {
  return {
    id: `p-${index}`,
    name: `Product ${index}`,
    slug: `product-${index}`,
    description: `Description ${index}`,
    category: null,
    media: [],
    variants: [
      {
        id: `v-${index}`,
        skuCode: `sku-${index}`,
        name: null,
        offers: [
          {
            id: `o-${index}`,
            status: 'PUBLISHED',
            currentPrice: { amount: (10 + index) * 100, currency: 'ZMW' },
            currencies: ['ZMW'],
            inStock: true,
            shippingCost: null,
          },
        ],
      },
    ],
  };
}

describe('TrendingHero', () => {
  it('renders nothing without products', () => {
    const { container } = render(<TrendingHero products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a slide per product linking to its page, with a dot for each', () => {
    const products = Array.from({ length: 3 }, (_, index) =>
      buildProduct(index),
    );
    render(<TrendingHero products={products} />);

    const shopLinks = screen.getAllByRole('link', { name: 'Shop now' });
    expect(shopLinks.map((link) => link.getAttribute('href'))).toEqual(
      products.map((product) => `/products/${product.slug}`),
    );
    for (const product of products) {
      expect(
        screen.getByRole('heading', { name: product.name }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: `Show ${product.name}` }),
      ).toBeInTheDocument();
    }
  });

  it('has no arrows or dots for a single product', () => {
    render(<TrendingHero products={[buildProduct(0)]} />);
    expect(screen.queryByRole('button', { name: /Show / })).toBeNull();
  });
});
