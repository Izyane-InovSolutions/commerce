import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CheckoutForm } from './checkout-form';

describe('CheckoutForm', () => {
  it('shows card fields by default', () => {
    render(<CheckoutForm total={100} />);

    expect(screen.getByLabelText('Name on card')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Mobile money number'),
    ).not.toBeInTheDocument();
  });

  it('switches to mobile money fields when selected', () => {
    render(<CheckoutForm total={100} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Mobile Money' }));

    expect(screen.getByLabelText('Mobile money number')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name on card')).not.toBeInTheDocument();
  });

  it('confirms the order once submitted', () => {
    render(<CheckoutForm total={100} />);

    fireEvent.change(screen.getByLabelText('Name on card'), {
      target: { value: 'Jane Mwanza' },
    });
    fireEvent.change(screen.getByLabelText('Card number'), {
      target: { value: '4242 4242 4242 4242' },
    });
    fireEvent.change(screen.getByLabelText('Expiry'), {
      target: { value: '12/30' },
    });
    fireEvent.change(screen.getByLabelText('CVC'), {
      target: { value: '123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Pay/ }));

    expect(screen.getByText('Order placed')).toBeInTheDocument();
  });
});
