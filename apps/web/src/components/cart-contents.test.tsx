import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CartContents } from './cart-contents';
import { CartProvider, type CartItem } from '@/lib/cart-context';

function seedCart(items: CartItem[]) {
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
      {
        slug: 'aria-wireless-earbuds',
        name: 'Aria Wireless Earbuds',
        unitPrice: 79,
        quantity: 2,
      },
      {
        slug: 'stride-running-shoes',
        name: 'Stride Running Shoes',
        unitPrice: 89,
        quantity: 1,
      },
    ]);

    render(
      <CartProvider>
        <CartContents />
      </CartProvider>,
    );

    expect(screen.getAllByText('Aria Wireless Earbuds')).not.toHaveLength(0);
    expect(screen.getAllByText('Stride Running Shoes')).not.toHaveLength(0);
    expect(
      screen.getByRole('link', { name: 'Proceed to Checkout' }),
    ).toHaveAttribute('href', '/checkout');
    // total = 79 * 2 + 89 * 1 = 247
    expect(screen.getByText(/247/)).toBeInTheDocument();
  });

  it('removes a line item when its remove button is clicked', () => {
    seedCart([
      {
        slug: 'aria-wireless-earbuds',
        name: 'Aria Wireless Earbuds',
        unitPrice: 79,
        quantity: 1,
      },
    ]);

    render(
      <CartProvider>
        <CartContents />
      </CartProvider>,
    );

    expect(screen.getAllByText('Aria Wireless Earbuds').length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
  });
});
