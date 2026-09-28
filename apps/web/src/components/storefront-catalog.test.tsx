import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StorefrontCatalog } from './storefront-catalog';
import type { Category, Product } from '@/lib/catalog-types';
import { DEFAULT_CATALOG_SORT, type CatalogParams } from '@/lib/catalog-query';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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
            inStock: true,
            shippingCost: null,
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
            inStock: true,
            shippingCost: null,
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
            inStock: true,
            shippingCost: null,
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
            inStock: true,
            shippingCost: null,
          },
        ],
      },
    ],
  },
];

describe('StorefrontCatalog', () => {
  const plain: CatalogParams = {
    attributes: [],
    sort: DEFAULT_CATALOG_SORT,
    page: 1,
  };

  function renderCatalog(
    params: Partial<CatalogParams> = {},
    extra: { total?: number; bestSellerIds?: string[] } = {},
  ) {
    return render(
      <StorefrontCatalog
        products={mockProducts}
        categories={mockCategories}
        total={extra.total ?? mockProducts.length}
        pageSize={24}
        params={{ ...plain, ...params }}
        bestSellerIds={extra.bestSellerIds}
      />,
    );
  }

  it('renders the page of products it was given, with the API total', () => {
    renderCatalog({}, { total: 57 });

    expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
    expect(screen.getByText('Smart Watch')).toBeInTheDocument();
    expect(screen.getByText('Ceramic Coffee Mug')).toBeInTheDocument();
    expect(screen.getByText('57 items')).toBeInTheDocument();
  });

  it('links each category pill to the filtered listing', () => {
    renderCatalog();

    expect(screen.getByRole('link', { name: 'Home & Living' })).toHaveAttribute(
      'href',
      '/products?category=home-and-living',
    );
    expect(
      screen.getByRole('link', { name: 'All Categories' }),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('marks the selected category and offers a way to clear it', () => {
    renderCatalog({ category: 'electronics' });

    expect(screen.getByRole('link', { name: 'Electronics' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      screen.getByRole('link', { name: 'Remove category filter' }),
    ).toHaveAttribute('href', '/products');
    expect(screen.getByRole('link', { name: 'Reset' })).toHaveAttribute(
      'href',
      '/products',
    );
  });

  it('keeps the current search in the search-within field', () => {
    renderCatalog({ q: 'headphones' });

    expect(
      screen.getByPlaceholderText('Search within products...'),
    ).toHaveValue('headphones');
  });

  it('badges best sellers', () => {
    renderCatalog({}, { bestSellerIds: ['prod-2'] });

    expect(screen.getAllByText('🔥 Best seller')).toHaveLength(1);
  });

  it('offers no reset when nothing is filtered', () => {
    renderCatalog();

    expect(
      screen.queryByRole('link', { name: 'Reset' }),
    ).not.toBeInTheDocument();
  });
});
