import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductDetailActions } from './product-detail-actions';
import { idleFormState } from '@/lib/form';

describe('ProductDetailActions quantity', () => {
  it('defaults to 1 and feeds both add-to-cart and buy-now', () => {
    const { container } = render(
      <ProductDetailActions
        name="Widget"
        slug="widget"
        available={true}
        inStock={true}
        addToCart={vi.fn().mockResolvedValue(idleFormState)}
        addToWishlist={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    const hiddenQuantity = container.querySelector(
      'input[type="hidden"][name="quantity"]',
    );
    expect(hiddenQuantity).toHaveValue('1');
    expect(screen.getByRole('link', { name: 'Buy it now' })).toHaveAttribute(
      'href',
      '/buy-now/widget?quantity=1',
    );
  });

  it('changing the quantity input updates both actions', () => {
    const { container } = render(
      <ProductDetailActions
        name="Widget"
        slug="widget"
        available={true}
        inStock={true}
        addToCart={vi.fn().mockResolvedValue(idleFormState)}
        addToWishlist={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    fireEvent.change(screen.getByLabelText('Quantity'), {
      target: { value: '4' },
    });

    const hiddenQuantity = container.querySelector(
      'input[type="hidden"][name="quantity"]',
    );
    expect(hiddenQuantity).toHaveValue('4');
    expect(screen.getByRole('link', { name: 'Buy it now' })).toHaveAttribute(
      'href',
      '/buy-now/widget?quantity=4',
    );
  });

  it('falls back to 1 for a non-positive quantity', () => {
    const { container } = render(
      <ProductDetailActions
        name="Widget"
        slug="widget"
        available={true}
        inStock={true}
        addToCart={vi.fn().mockResolvedValue(idleFormState)}
        addToWishlist={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    fireEvent.change(screen.getByLabelText('Quantity'), {
      target: { value: '0' },
    });

    const hiddenQuantity = container.querySelector(
      'input[type="hidden"][name="quantity"]',
    );
    expect(hiddenQuantity).toHaveValue('1');
  });
});

describe('ProductDetailActions availability', () => {
  it('shows an out-of-stock message and disables buying, without touching add-to-cart', () => {
    render(
      <ProductDetailActions
        name="Widget"
        slug="widget"
        available={true}
        inStock={false}
        addToCart={vi.fn().mockResolvedValue(idleFormState)}
        addToWishlist={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Out of stock');
    expect(
      screen.getByRole('button', { name: 'Out of stock' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('link', { name: 'Buy it now' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add to cart' }),
    ).not.toBeInTheDocument();
  });

  it('still lets a shopper add an out-of-stock product to their wishlist', async () => {
    const addToWishlist = vi.fn().mockResolvedValue(idleFormState);
    render(
      <ProductDetailActions
        name="Widget"
        slug="widget"
        available={true}
        inStock={false}
        addToCart={vi.fn().mockResolvedValue(idleFormState)}
        addToWishlist={addToWishlist}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to wishlist' }));

    await vi.waitFor(() => expect(addToWishlist).toHaveBeenCalledTimes(1));
  });

  it('shows "Currently unavailable" when the product has no sellable offer at all, even if inStock is true', () => {
    render(
      <ProductDetailActions
        name="Widget"
        slug="widget"
        available={false}
        inStock={true}
        addToCart={vi.fn().mockResolvedValue(idleFormState)}
        addToWishlist={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    expect(screen.getByText('Currently unavailable')).toBeInTheDocument();
  });
});
