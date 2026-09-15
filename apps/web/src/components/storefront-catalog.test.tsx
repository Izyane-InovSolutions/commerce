import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StorefrontCatalog } from './storefront-catalog';
import type { Category, Product } from '@/lib/catalog-types';

const mockCategories: Category[] = [
  {
    id: 'cat-1',
    name: 'Electronics',
    slug: 'electronics',
    description: null,
    parentId: null,
    position: 1,
  },
  {
    id: 'cat-2',
    name: 'Home & Living',
    slug: 'home-and-living',
    description: null,
    parentId: null,
    position: 2,
  },
];

const mockProducts: Product[] = [
  {
    id: 'prod-1',
    name: 'Wireless Headphones',
    slug: 'wireless-headphones',
    description: 'Noise cancelling Bluetooth headphones.',
    category: mockCategories[0]!,
    media: [],
    variants: [
      {
        id: 'var-1',
        skuCode: 'WH-01',
        name: null,
        offers: [
          {
            id: 'off-1',
            status: 'PUBLISHED',
            currentPrice: { amount: 15000, currency: 'ZMW' },
            currencies: ['ZMW'],
          },
        ],
      },
    ],
  },
  {
    id: 'prod-2',
    name: 'Smart Watch',
    slug: 'smart-watch',
    description: 'Fitness tracking smart wearable.',
    category: mockCategories[0]!,
    media: [],
    variants: [
      {
        id: 'var-2a',
        skuCode: 'SW-01',
        name: 'Black',
        offers: [
          {
            id: 'off-2a',
            status: 'PUBLISHED',
            currentPrice: { amount: 25000, currency: 'ZMW' },
            currencies: ['ZMW'],
          },
        ],
      },
      {
        id: 'var-2b',
        skuCode: 'SW-02',
        name: 'Silver',
        offers: [
          {
            id: 'off-2b',
            status: 'PUBLISHED',
            currentPrice: { amount: 26000, currency: 'ZMW' },
            currencies: ['ZMW'],
          },
        ],
      },
    ],
  },
  {
    id: 'prod-3',
    name: 'Ceramic Coffee Mug',
    slug: 'ceramic-coffee-mug',
    description: 'Handcrafted artisan mug.',
    category: mockCategories[1]!,
    media: [],
    variants: [
      {
        id: 'var-3',
        skuCode: 'MUG-01',
        name: null,
        offers: [
          {
            id: 'off-3',
            status: 'PUBLISHED',
            currentPrice: { amount: 3500, currency: 'ZMW' },
            currencies: ['ZMW'],
          },
        ],
      },
    ],
  },
];

describe('StorefrontCatalog', () => {
  it('renders all products and category pills initially', () => {
    render(
      <StorefrontCatalog products={mockProducts} categories={mockCategories} />,
    );

    expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
    expect(screen.getByText('Smart Watch')).toBeInTheDocument();
    expect(screen.getByText('Ceramic Coffee Mug')).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: /All Categories/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Electronics/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Home & Living/ }),
    ).toBeInTheDocument();
  });

  it('filters products when a category pill is selected', () => {
    render(
      <StorefrontCatalog products={mockProducts} categories={mockCategories} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Home & Living/ }));

    expect(screen.getByText('Ceramic Coffee Mug')).toBeInTheDocument();
    expect(screen.queryByText('Wireless Headphones')).not.toBeInTheDocument();
    expect(screen.queryByText('Smart Watch')).not.toBeInTheDocument();
  });

  it('filters by trending products', () => {
    render(
      <StorefrontCatalog products={mockProducts} categories={mockCategories} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Trending/ }));

    // Smart Watch has 2 variants so it is always marked trending
    expect(screen.getByText('Smart Watch')).toBeInTheDocument();
  });

  it('filters by search input', () => {
    render(
      <StorefrontCatalog products={mockProducts} categories={mockCategories} />,
    );

    const searchInput = screen.getByPlaceholderText(
      'Search within products...',
    );
    fireEvent.change(searchInput, { target: { value: 'headphones' } });

    expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
    expect(screen.queryByText('Smart Watch')).not.toBeInTheDocument();
    expect(screen.queryByText('Ceramic Coffee Mug')).not.toBeInTheDocument();
  });

  it('allows resetting filters', () => {
    render(
      <StorefrontCatalog products={mockProducts} categories={mockCategories} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Home & Living/ }));
    expect(screen.queryByText('Wireless Headphones')).not.toBeInTheDocument();

    const resetButton = screen.getByRole('button', { name: 'Reset' });
    fireEvent.click(resetButton);

    expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
    expect(screen.getByText('Ceramic Coffee Mug')).toBeInTheDocument();
  });
});
