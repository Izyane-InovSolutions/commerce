import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CheckoutForm } from './checkout-form';
import { idleFormState } from '@/lib/form';
import type { Address } from '@/lib/commerce-types';

const addresses: Address[] = [
  {
    id: 'addr-1',
    label: null,
    recipientName: 'Jane Doe',
    phone: null,
    line1: '1 Main St',
    line2: null,
    city: 'Lusaka',
    region: null,
    postalCode: '10101',
    country: 'ZM',
    isDefault: true,
  },
];

function renderForm() {
  return render(
    <CheckoutForm
      addresses={addresses}
      currency="ZMW"
      placeOrder={vi.fn().mockResolvedValue(idleFormState)}
    />,
  );
}

describe('CheckoutForm mobile network detection', () => {
  it('auto-selects MTN for an MTN prefix as it is typed', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Mobile money number'), {
      target: { value: '0961234567' },
    });

    expect(
      (screen.getByLabelText('Mobile network') as HTMLSelectElement).value,
    ).toBe('MTN');
    expect(
      screen.getByText('Detected automatically from your number.'),
    ).toBeInTheDocument();
  });

  it('auto-selects Airtel for an Airtel prefix as it is typed', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Mobile money number'), {
      target: { value: '0971234567' },
    });

    expect(
      (screen.getByLabelText('Mobile network') as HTMLSelectElement).value,
    ).toBe('AIRTEL');
  });

  it('lets a manual choice override the detected network', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Mobile money number'), {
      target: { value: '0961234567' },
    });
    fireEvent.change(screen.getByLabelText('Mobile network'), {
      target: { value: 'AIRTEL' },
    });

    expect(
      (screen.getByLabelText('Mobile network') as HTMLSelectElement).value,
    ).toBe('AIRTEL');
    expect(
      screen.queryByText('Detected automatically from your number.'),
    ).not.toBeInTheDocument();
  });
});
