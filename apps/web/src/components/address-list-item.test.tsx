import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AddressListItem } from './address-list-item';
import { idleFormState } from '@/lib/form';
import type { Address } from '@/lib/commerce-types';

const address: Address = {
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
  isDefault: false,
};

describe('AddressListItem', () => {
  it('shows a "Set as default" action for a non-default address, and hides it once default', () => {
    const { rerender } = render(
      <AddressListItem
        address={address}
        update={vi.fn().mockResolvedValue(idleFormState)}
        remove={vi.fn().mockResolvedValue(idleFormState)}
        setDefault={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Set as default' }),
    ).toBeInTheDocument();

    rerender(
      <AddressListItem
        address={{ ...address, isDefault: true }}
        update={vi.fn().mockResolvedValue(idleFormState)}
        remove={vi.fn().mockResolvedValue(idleFormState)}
        setDefault={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Set as default' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('calls setDefault when "Set as default" is submitted', async () => {
    const setDefault = vi.fn().mockResolvedValue(idleFormState);
    render(
      <AddressListItem
        address={address}
        update={vi.fn().mockResolvedValue(idleFormState)}
        remove={vi.fn().mockResolvedValue(idleFormState)}
        setDefault={setDefault}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set as default' }));

    await vi.waitFor(() => expect(setDefault).toHaveBeenCalledTimes(1));
  });

  it('calls remove when "Remove" is submitted', async () => {
    const remove = vi.fn().mockResolvedValue(idleFormState);
    render(
      <AddressListItem
        address={address}
        update={vi.fn().mockResolvedValue(idleFormState)}
        remove={remove}
        setDefault={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });

  it('switches to an edit form pre-filled with the address, and back on Cancel', () => {
    render(
      <AddressListItem
        address={address}
        update={vi.fn().mockResolvedValue(idleFormState)}
        remove={vi.fn().mockResolvedValue(idleFormState)}
        setDefault={vi.fn().mockResolvedValue(idleFormState)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Recipient name')).toHaveValue('Jane Doe');
    expect(screen.getByLabelText('Address')).toHaveValue('1 Main St');
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Recipient name'),
    ).not.toBeInTheDocument();
  });
});
