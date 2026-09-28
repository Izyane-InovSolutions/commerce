import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CurrencySwitcher } from './currency-switcher';

describe('CurrencySwitcher', () => {
  it('just names the currency when there is only one to choose', () => {
    render(
      <CurrencySwitcher current="ZMW" currencies={['ZMW']} action={vi.fn()} />,
    );

    expect(screen.getByText('Prices in ZMW')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('offers every supported currency, with the current one selected', () => {
    render(
      <CurrencySwitcher
        current="USD"
        currencies={['ZMW', 'USD']}
        action={vi.fn()}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Currency' });
    expect(select).toHaveValue('USD');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});
