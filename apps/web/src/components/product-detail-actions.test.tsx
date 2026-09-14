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
