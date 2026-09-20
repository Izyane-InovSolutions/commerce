import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductCard } from './product-card';
import type { Product, ProductOffer } from '@/lib/catalog-types';

function buildOffer(overrides: Partial<ProductOffer> = {}): ProductOffer {
  return {
    id: 'offer-1',
    status: 'PUBLISHED',
    currentPrice: { amount: 1999, currency: 'ZMW' },
    currencies: ['ZMW'],
    inStock: true,
    shippingCost: null,
    ...overrides,
  };
}

function buildProduct(offer: ProductOffer): Product {
  return {
    id: 'p1',
    name: 'Widget',
    slug: 'widget',
    description: null,
    category: null,
    media: [],
    variants: [{ id: 'v1', skuCode: 'WID-1', name: null, offers: [offer] }],
  };
}

describe('ProductCard', () => {
  it('shows the price with no badge when the offer is in stock and has no shipping cost', () => {
    render(<ProductCard product={buildProduct(buildOffer())} />);

    expect(screen.getByText(/^K\s*19\.99$/)).toBeInTheDocument();
    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
    expect(screen.queryByText(/shipping/i)).not.toBeInTheDocument();
  });

  it('shows an "Out of stock" badge, overriding any other badge, when the offer has run out', () => {
    render(
      <ProductCard
        product={buildProduct(buildOffer({ inStock: false }))}
        badge="New"
      />,
    );

    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('shows the badge normally when the offer is in stock', () => {
    render(<ProductCard product={buildProduct(buildOffer())} badge="New" />);

    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('shows a flat shipping cost under the price', () => {
    render(
      <ProductCard
        product={buildProduct(
          buildOffer({ shippingCost: { amount: 500, currency: 'ZMW' } }),
        )}
      />,
    );

    expect(screen.getByText(/^\+\s*K\s*5\.00 shipping$/)).toBeInTheDocument();
  });

  it('shows "Free shipping" for a zero shipping cost', () => {
    render(
      <ProductCard
        product={buildProduct(
          buildOffer({ shippingCost: { amount: 0, currency: 'ZMW' } }),
        )}
      />,
    );

    expect(screen.getByText('Free shipping')).toBeInTheDocument();
  });

  it('shows who it’s sold by for a marketplace offer', () => {
    render(
      <ProductCard
        product={buildProduct(
          buildOffer({
            isFirstParty: false,
            seller: {
              id: 'seller-1',
              storefrontSlug: 'acme',
              displayName: 'Acme',
              description: null,
            },
          }),
        )}
      />,
    );

    expect(screen.getByText('Sold by Acme')).toBeInTheDocument();
  });

  it('shows no "Sold by" line for the platform’s own offer', () => {
    render(<ProductCard product={buildProduct(buildOffer())} />);

    expect(screen.queryByText(/^Sold by/)).not.toBeInTheDocument();
  });
});
