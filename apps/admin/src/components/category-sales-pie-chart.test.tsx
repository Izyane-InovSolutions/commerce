import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CategorySalesPieChart } from './category-sales-pie-chart';

describe('CategorySalesPieChart', () => {
  it('renders the card chrome for a non-empty series', () => {
    render(
      <CategorySalesPieChart
        shares={[
          { category: 'Electronics', slug: 'electronics', value: 42 },
          { category: 'Home & Living', slug: 'home', value: 18 },
        ]}
      />,
    );

    expect(screen.getByText('Best-selling categories')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Sample share — there is no sales-by-category endpoint yet.',
      ),
    ).toBeInTheDocument();
  });

  it('renders nothing when there are no categories', () => {
    const { container } = render(<CategorySalesPieChart shares={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
