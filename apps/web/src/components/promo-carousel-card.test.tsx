import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PromoCarouselCard } from './promo-carousel-card';
import type { StaticImageData } from 'next/image';
import type { Product } from '@/lib/catalog-types';

const banner: StaticImageData = { src: '/banner.png', width: 800, height: 400 };

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
  it('shows the title, a shop-all link, and up to three products on the first page', () => {
    const products = Array.from({ length: 4 }, (_, index) => buildProduct(index));
    render(
      <PromoCarouselCard
        title="Trending"
        href="/products?filter=trending"
        banner={banner}
        products={products}
      />,
    );

    expect(screen.getByText('Trending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop all' })).toHaveAttribute(
      'href',
      '/products?filter=trending',
    );
    expect(screen.getByText('Product 0')).toBeInTheDocument();
    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('Product 2')).toBeInTheDocument();
    expect(screen.queryByText('Product 3')).not.toBeInTheDocument();
  });

  it('has no pager for three or fewer products', () => {
    render(
      <PromoCarouselCard
        title="Trending"
        href="/products?filter=trending"
        banner={banner}
        products={[buildProduct(0), buildProduct(1), buildProduct(2)]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Next products' }),
    ).not.toBeInTheDocument();
  });

  it('advances to the next page of products, looping back into the list so every page still shows three', () => {
    const products = Array.from({ length: 4 }, (_, index) => buildProduct(index));
    render(
      <PromoCarouselCard
        title="Trending"
        href="/products?filter=trending"
        banner={banner}
        products={products}
      />,
    );

    // Page 2 of 4 products wraps: [3, 0, 1] — still three, not a short
    // trailing page of just [3].
    fireEvent.click(screen.getByRole('button', { name: 'Next products' }));
    expect(screen.getByText('Product 3')).toBeInTheDocument();
    expect(screen.getByText('Product 0')).toBeInTheDocument();
    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.queryByText('Product 2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next products' }));
    expect(screen.getByText('Product 0')).toBeInTheDocument();
    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('Product 2')).toBeInTheDocument();
  });

  it('renders no product content, and no controls, for an empty list', () => {
    render(
      <PromoCarouselCard
        title="Trending"
        href="/products?filter=trending"
        banner={banner}
        products={[]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Next products' }),
    ).not.toBeInTheDocument();
  });
});
