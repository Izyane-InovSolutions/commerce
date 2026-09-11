import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CartProvider, useCart } from './cart-context';

function TestHarness() {
  const { items, addItem, removeItem } = useCart();

  return (
    <div>
      <p data-testid="count">{items.length}</p>
      <p data-testid="quantity-a">
        {items.find((item) => item.productId === 'a')?.quantity ?? 0}
      </p>
      <button onClick={() => addItem('a')}>Add A</button>
      <button onClick={() => addItem('b')}>Add B</button>
      <button onClick={() => removeItem('a')}>Remove A</button>
    </div>
  );
}

describe('CartProvider / useCart', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts empty', () => {
    render(
      <CartProvider>
        <TestHarness />
      </CartProvider>,
    );

    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('adds items and increments quantity on repeat adds', () => {
    render(
      <CartProvider>
        <TestHarness />
      </CartProvider>,
    );

    fireEvent.click(screen.getByText('Add A'));
    fireEvent.click(screen.getByText('Add A'));
    fireEvent.click(screen.getByText('Add B'));

    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByTestId('quantity-a')).toHaveTextContent('2');
  });

  it('removes an item entirely', () => {
    render(
      <CartProvider>
        <TestHarness />
      </CartProvider>,
    );

    fireEvent.click(screen.getByText('Add A'));
    fireEvent.click(screen.getByText('Remove A'));

    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('persists cart contents to localStorage', () => {
    render(
      <CartProvider>
        <TestHarness />
      </CartProvider>,
    );

    fireEvent.click(screen.getByText('Add A'));

    const stored = JSON.parse(
      window.localStorage.getItem('commerce-cart') ?? '[]',
    );
    expect(stored).toEqual([{ productId: 'a', quantity: 1 }]);
  });

  it('hydrates from localStorage on mount', () => {
    window.localStorage.setItem(
      'commerce-cart',
      JSON.stringify([{ productId: 'a', quantity: 3 }]),
    );

    render(
      <CartProvider>
        <TestHarness />
      </CartProvider>,
    );

    expect(screen.getByTestId('quantity-a')).toHaveTextContent('3');
  });
});
