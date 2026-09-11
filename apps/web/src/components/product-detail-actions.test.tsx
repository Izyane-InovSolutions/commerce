import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductDetailActions } from './product-detail-actions';

describe('ProductDetailActions', () => {
  it('links the checkout button to the checkout route', () => {
    render(<ProductDetailActions productName="Test Product" />);

    expect(screen.getByRole('link', { name: 'Checkout' })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });

  it('confirms the add to cart action once clicked', () => {
    render(<ProductDetailActions productName="Test Product" />);

    expect(
      screen.queryByText('Test Product added to your cart.'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));

    expect(
      screen.getByRole('button', { name: 'Added to cart' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Test Product added to your cart.'),
    ).toBeInTheDocument();
  });
});
