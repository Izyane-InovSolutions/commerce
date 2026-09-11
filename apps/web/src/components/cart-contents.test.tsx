import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CartContents } from './cart-contents';
import { CartProvider } from '@/lib/cart-context';
import { getProductById } from '@/lib/mock-data/products';

function seedCart(items: { productId: string; quantity: number }[]) {
  window.localStorage.setItem('commerce-cart', JSON.stringify(items));
}

describe('CartContents', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows an empty state with a link to keep shopping', () => {
    render(
      <CartProvider>
        <CartContents />
      </CartProvider>,
    );

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse products' }),
    ).toHaveAttribute('href', '/products');
  });

  it('lists cart items with quantities and a running total', () => {
    seedCart([
      { productId: 'na-1', quantity: 2 },
      { productId: 'bs-3', quantity: 1 },
    ]);

    render(
      <CartProvider>
        <CartContents />
      </CartProvider>,
    );

    const naProduct = getProductById('na-1')!;
    const bsProduct = getProductById('bs-3')!;
    const total = naProduct.price * 2 + bsProduct.price;

    expect(screen.getAllByText(naProduct.name)).not.toHaveLength(0);
    expect(screen.getAllByText(bsProduct.name)).not.toHaveLength(0);
    expect(
      screen.getByRole('link', { name: 'Proceed to Checkout' }),
    ).toHaveAttribute('href', '/checkout');
    expect(screen.getByText(new RegExp(String(total)))).toBeInTheDocument();
  });

  it('removes a line item when its remove button is clicked', () => {
    seedCart([{ productId: 'na-1', quantity: 1 }]);

    render(
      <CartProvider>
        <CartContents />
      </CartProvider>,
    );

    const naProduct = getProductById('na-1')!;
    expect(screen.getAllByText(naProduct.name).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
  });
});
