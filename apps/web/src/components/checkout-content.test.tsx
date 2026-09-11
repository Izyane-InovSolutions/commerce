import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CheckoutContent } from './checkout-content';
import { CartProvider } from '@/lib/cart-context';
import { getProductById } from '@/lib/mock-data/products';

function seedCart(items: { productId: string; quantity: number }[]) {
  window.localStorage.setItem('commerce-cart', JSON.stringify(items));
}

describe('CheckoutContent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows an empty state instead of the payment form when the cart is empty', () => {
    render(
      <CartProvider>
        <CheckoutContent />
      </CartProvider>,
    );

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByText('Payment method')).not.toBeInTheDocument();
  });

  it('shows the order summary and payment form when the cart has items', () => {
    seedCart([{ productId: 'na-1', quantity: 2 }]);

    render(
      <CartProvider>
        <CheckoutContent />
      </CartProvider>,
    );

    const product = getProductById('na-1')!;
    const total = product.price * 2;

    expect(screen.getByText('Payment method')).toBeInTheDocument();
    expect(screen.getByText(`${product.name} × 2`)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(String(total)) }),
    ).toBeInTheDocument();
  });
});
