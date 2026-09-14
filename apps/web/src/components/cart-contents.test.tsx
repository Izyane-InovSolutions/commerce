import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CartContents } from './cart-contents';
import type { OfferLabel } from '@/lib/cart';
import type { CartView } from '@/lib/commerce-types';

function subtotalText(): string {
  const label = screen.getByText('Subtotal');
  const row = label.parentElement;
  if (!row) {
    throw new Error('Subtotal row not found');
  }
  return (within(row).getByText(/^K\s/).textContent ?? '').replace(
    /\s/g,
    ' ',
  );
}

function line(overrides: Partial<CartView['items'][number]> = {}) {
  return {
    id: 'line-1',
    offerId: 'offer-1',
    sellerId: null,
    quantity: 1,
    unitPrice: { amount: 1000, currency: 'ZMW' },
    lineTotal: 1000,
    isAvailable: true,
    currencies: ['ZMW'],
    ...overrides,
  };
}

const labels: Record<string, OfferLabel> = {
  'offer-1': { name: 'Widget', slug: 'widget', imageUrl: null },
  'offer-2': { name: 'Gadget', slug: 'gadget', imageUrl: null },
};

describe('CartContents selection', () => {
  it('pre-selects every available line and sums their totals into the subtotal', () => {
    const cart: CartView = {
      id: 'cart-1',
      currency: 'ZMW',
      subtotal: 3000,
      items: [
        line({ id: 'line-1', offerId: 'offer-1', lineTotal: 1000 }),
        line({ id: 'line-2', offerId: 'offer-2', lineTotal: 2000 }),
      ],
    };

    render(<CartContents cart={cart} labels={labels} />);

    expect(subtotalText()).toBe('K 30.00');
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.every((box) => box.getAttribute('data-state') === 'checked')).toBe(true);
  });

  it('auto-deselects an out-of-stock line and excludes it from the subtotal', () => {
    const cart: CartView = {
      id: 'cart-1',
      currency: 'ZMW',
      subtotal: 1000,
      items: [
        line({ id: 'line-1', offerId: 'offer-1', lineTotal: 1000 }),
        line({
          id: 'line-2',
          offerId: 'offer-2',
          lineTotal: 2000,
          isAvailable: false,
        }),
      ],
    };

    render(<CartContents cart={cart} labels={labels} />);

    // Only the available line's total is counted.
    expect(subtotalText()).toBe('K 10.00');

    const checkboxes = screen.getAllByRole('checkbox');
    const disabled = checkboxes.find((box) => box.hasAttribute('disabled'));
    expect(disabled).toBeDefined();
    expect(disabled?.getAttribute('data-state')).toBe('unchecked');
    expect(screen.getByText(/Out of stock/)).toBeInTheDocument();
  });

  it('adjusts the subtotal and the checkout link when a line is unchecked', () => {
    const cart: CartView = {
      id: 'cart-1',
      currency: 'ZMW',
      subtotal: 3000,
      items: [
        line({ id: 'line-1', offerId: 'offer-1', lineTotal: 1000 }),
        line({ id: 'line-2', offerId: 'offer-2', lineTotal: 2000 }),
      ],
    };

    render(<CartContents cart={cart} labels={labels} />);

    const widgetCheckbox = screen.getByRole('checkbox', {
      name: 'Include Widget in checkout',
    });
    fireEvent.click(widgetCheckbox);

    expect(subtotalText()).toBe('K 20.00');
    expect(
      screen.getByRole('link', { name: 'Proceed to checkout' }),
    ).toHaveAttribute('href', '/checkout?items=line-2');
  });

  it('disables checkout once every line is deselected', () => {
    const cart: CartView = {
      id: 'cart-1',
      currency: 'ZMW',
      subtotal: 1000,
      items: [line({ id: 'line-1', offerId: 'offer-1', lineTotal: 1000 })],
    };

    render(<CartContents cart={cart} labels={labels} />);

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Include Widget in checkout' }),
    );

    expect(
      screen.getByRole('button', { name: 'Select at least one item' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('link', { name: 'Proceed to checkout' }),
    ).not.toBeInTheDocument();
  });
});
