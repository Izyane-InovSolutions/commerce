import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ProductCategorySection,
  type ProductSection,
} from './product-category-section';
import type { Product } from '@/lib/catalog-types';

function makeProduct(index: number): Product {
  return {
    id: `p-${index}`,
    name: `Product ${index}`,
    slug: `product-${index}`,
    description: `Description for product ${index}.`,
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

const category: ProductSection = {
  slug: 'test-category',
  title: 'Test Category',
  products: Array.from({ length: 6 }, (_, index) => makeProduct(index)),
};

describe('ProductCategorySection', () => {
  it('shows only the first four products until expanded', () => {
    render(<ProductCategorySection category={category} />);

    expect(screen.getByText('Product 0')).toBeInTheDocument();
    expect(screen.getByText('Product 3')).toBeInTheDocument();
    expect(screen.queryByText('Product 4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View more' }));

    expect(screen.getByText('Product 4')).toBeInTheDocument();
    expect(screen.getByText('Product 5')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View less' }),
    ).toBeInTheDocument();
  });

  it('hides the toggle when there is nothing more to show', () => {
    render(
      <ProductCategorySection
        category={{ ...category, products: category.products.slice(0, 2) }}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /view (more|less)/i }),
    ).not.toBeInTheDocument();
  });
});
