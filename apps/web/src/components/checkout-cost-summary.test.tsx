import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CheckoutCostSummary, type CheckoutQuoteResult } from './checkout-cost-summary';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Matches "K 20.00" and "K20.00" alike — `formatMinor` may use a non-breaking space. */
function money(amount: string): RegExp {
  return new RegExp(`^K\\s*${amount}$`);
}

function payButtonName(amount: string): RegExp {
  return new RegExp(`^Pay\\s*K\\s*${amount}$`);
}

describe('CheckoutCostSummary', () => {
  it('shows the subtotal immediately and nothing for shipping until an address is chosen', () => {
    render(
      <CheckoutCostSummary
        subtotal={2000}
        currency="ZMW"
        selectedAddressId={undefined}
        itemIds={['item-1']}
        getQuote={vi.fn()}
      />,
    );

    expect(screen.getAllByText(money('20\\.00'))).toHaveLength(2); // subtotal and total (the Pay button's text also says "Pay", so it doesn't match)
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('quotes shipping once an address is selected, and updates the total to match', async () => {
    const { promise, resolve } = deferred<CheckoutQuoteResult>();
    const getQuote = vi.fn().mockReturnValue(promise);

    render(
      <CheckoutCostSummary
        subtotal={2000}
        currency="ZMW"
        selectedAddressId="addr-1"
        itemIds={['item-1']}
        getQuote={getQuote}
      />,
    );

    expect(getQuote).toHaveBeenCalledWith({
      shippingAddressId: 'addr-1',
      currency: 'ZMW',
      itemIds: ['item-1'],
    });
    expect(screen.getByText('Calculating…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pay/ })).toBeDisabled();

    resolve({ status: 'ok', quote: { shippingAmount: 500, total: 2500 } });

    expect(
      await screen.findByRole('button', { name: payButtonName('25\\.00') }),
    ).toBeEnabled();
    expect(screen.getByText(money('5\\.00'))).toBeInTheDocument();
  });

  it('re-quotes when the selected address changes', async () => {
    const getQuote = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'ok',
        quote: { shippingAmount: 500, total: 2500 },
      })
      .mockResolvedValueOnce({
        status: 'ok',
        quote: { shippingAmount: 1500, total: 3500 },
      });

    const { rerender } = render(
      <CheckoutCostSummary
        subtotal={2000}
        currency="ZMW"
        selectedAddressId="addr-1"
        itemIds={['item-1']}
        getQuote={getQuote}
      />,
    );

    await screen.findByRole('button', { name: payButtonName('25\\.00') });

    rerender(
      <CheckoutCostSummary
        subtotal={2000}
        currency="ZMW"
        selectedAddressId="addr-2"
        itemIds={['item-1']}
        getQuote={getQuote}
      />,
    );

    expect(getQuote).toHaveBeenLastCalledWith({
      shippingAddressId: 'addr-2',
      currency: 'ZMW',
      itemIds: ['item-1'],
    });
    expect(
      await screen.findByRole('button', { name: payButtonName('35\\.00') }),
    ).toBeInTheDocument();
  });

  it('falls back to the subtotal as the total when the quote fails', async () => {
    const getQuote = vi
      .fn()
      .mockResolvedValue({ status: 'error', message: 'Address not found.' });

    render(
      <CheckoutCostSummary
        subtotal={2000}
        currency="ZMW"
        selectedAddressId="addr-1"
        itemIds={['item-1']}
        getQuote={getQuote}
      />,
    );

    expect(
      await screen.findByRole('button', { name: payButtonName('20\\.00') }),
    ).toBeEnabled();
    expect(screen.getByText('Confirmed when you pay')).toBeInTheDocument();
    expect(
      screen.getByText(/exact amount is confirmed when you pay/i),
    ).toBeInTheDocument();
  });
});
