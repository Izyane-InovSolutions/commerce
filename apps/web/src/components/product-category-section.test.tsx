import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductCategorySection } from './product-category-section';
import type { ProductCategory } from '@/lib/mock-data/products';

const category: ProductCategory = {
  slug: 'test-category',
  title: 'Test Category',
  products: Array.from({ length: 6 }, (_, index) => ({
    id: `p-${index}`,
    name: `Product ${index}`,
    price: 10 + index,
    description: `Description for product ${index}.`,
  })),
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
