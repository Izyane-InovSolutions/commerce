import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CheckoutForm } from './checkout-form';

describe('CheckoutForm', () => {
  it('shows card fields by default', () => {
    render(<CheckoutForm onPlaced={vi.fn()} />);

    expect(screen.getByLabelText('Name on card')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Mobile money number'),
    ).not.toBeInTheDocument();
  });

  it('switches to mobile money fields when selected', () => {
    render(<CheckoutForm onPlaced={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Mobile Money' }));

    expect(screen.getByLabelText('Mobile money number')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name on card')).not.toBeInTheDocument();
  });

  it('formats the card number into groups of 4 and caps it at 16 digits', () => {
    render(<CheckoutForm onPlaced={vi.fn()} />);

    const input = screen.getByLabelText('Card number');
    fireEvent.change(input, { target: { value: '4242424242424242999' } });

    expect(input).toHaveValue('4242 4242 4242 4242');
  });

  it('auto-inserts the slash and clamps an invalid month in the expiry field', () => {
    render(<CheckoutForm onPlaced={vi.fn()} />);

    const input = screen.getByLabelText('Expiry');
    fireEvent.change(input, { target: { value: '13' } });

    expect(input).toHaveValue('12/');
  });

  it('caps the CVC at 3 digits', () => {
    render(<CheckoutForm onPlaced={vi.fn()} />);

    const input = screen.getByLabelText('CVC');
    fireEvent.change(input, { target: { value: '12345' } });

    expect(input).toHaveValue('123');
  });

  it('formats the mobile money number as 0XX XXX XXXX', () => {
    render(<CheckoutForm onPlaced={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Mobile Money' }));

    const input = screen.getByLabelText('Mobile money number');
    fireEvent.change(input, { target: { value: '0971234567' } });

    expect(input).toHaveValue('097 123 4567');
  });
});
