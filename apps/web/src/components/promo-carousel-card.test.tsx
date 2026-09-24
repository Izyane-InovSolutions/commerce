import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PromoCarouselCard } from './promo-carousel-card';
import type { Product } from '@/lib/catalog-types';

const gradientClassName = 'bg-linear-to-br from-amber-500 to-rose-600';

function buildProduct(index: number): Product {
  return {
    id: `p-${index}`,
    name: `Product ${index}`,
    slug: `product-${index}`,
    description: null,
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

describe('PromoCarouselCard', () => {
  it('shows the title, a shop-all link, and every product (Embla mounts the whole track, not just one page)', () => {
    const products = Array.from({ length: 4 }, (_, index) => buildProduct(index));
    render(
      <PromoCarouselCard
        title="Trending"
        href="/products?filter=trending"
        gradientClassName={gradientClassName}
        products={products}
      />,
    );

    expect(screen.getByText('Trending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop all' })).toHaveAttribute(
      'href',
      '/products?filter=trending',
    );
    for (const product of products) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
  });

  it('has no pager for three or fewer products', () => {
    render(
      <PromoCarouselCard
        title="Trending"
        href="/products?filter=trending"
        gradientClassName={gradientClassName}
        products={[buildProduct(0), buildProduct(1), buildProduct(2)]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Next slide' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Previous slide' }),
    ).not.toBeInTheDocument();
  });

  it('renders no product content, and no controls, for an empty list', () => {
    render(
      <PromoCarouselCard
        title="Trending"
        href="/products?filter=trending"
        gradientClassName={gradientClassName}
        products={[]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Next slide' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});
