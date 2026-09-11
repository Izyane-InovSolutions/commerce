import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CheckoutContent } from './checkout-content';
import { CartProvider, type CartItem } from '@/lib/cart-context';

function seedCart(items: CartItem[]) {
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
    seedCart([
      {
        slug: 'aria-wireless-earbuds',
        name: 'Aria Wireless Earbuds',
        unitPrice: 79,
        quantity: 2,
      },
    ]);

    render(
      <CartProvider>
        <CheckoutContent />
      </CartProvider>,
    );

    expect(screen.getByText('Payment method')).toBeInTheDocument();
    expect(screen.getByText('Aria Wireless Earbuds × 2')).toBeInTheDocument();
    // total = 79 * 2 = 158
    expect(screen.getByRole('button', { name: /158/ })).toBeInTheDocument();
  });

  it('renders the pay button after the order summary, not inside the form fields', () => {
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
        <CheckoutContent />
      </CartProvider>,
    );

    const summaryHeading = screen.getByText('Order summary');
    const payButton = screen.getByRole('button', { name: /Pay/ });

    expect(
      summaryHeading.compareDocumentPosition(payButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('places the order when the relocated pay button is submitted', () => {
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
        <CheckoutContent />
      </CartProvider>,
    );

    fireEvent.change(screen.getByLabelText('Name on card'), {
      target: { value: 'Jane Mwanza' },
    });
    fireEvent.change(screen.getByLabelText('Card number'), {
      target: { value: '4242424242424242' },
    });
    fireEvent.change(screen.getByLabelText('Expiry'), {
      target: { value: '1230' },
    });
    fireEvent.change(screen.getByLabelText('CVC'), {
      target: { value: '123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Pay/ }));

    expect(screen.getByText('Order placed')).toBeInTheDocument();
  });
});
