import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductDetailActions } from './product-detail-actions';
import { CartProvider } from '@/lib/cart-context';

describe('ProductDetailActions', () => {
  it('links the checkout button to the checkout route', () => {
    render(
      <CartProvider>
        <ProductDetailActions slug="p-1" name="Test Product" unitPrice={10} />
      </CartProvider>,
    );

    expect(screen.getByRole('link', { name: 'Checkout' })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });

  it('adds the product to the cart and confirms once clicked', () => {
    render(
      <CartProvider>
        <ProductDetailActions slug="p-1" name="Test Product" unitPrice={10} />
      </CartProvider>,
    );

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

  it('disables the button and hides the checkout prompt when unavailable', () => {
    render(
      <CartProvider>
        <ProductDetailActions slug="p-1" name="Test Product" unitPrice={null} />
      </CartProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Currently unavailable' }),
    ).toBeDisabled();
  });
});
