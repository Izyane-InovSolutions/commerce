import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrdersFilterList, type OrderCard } from './orders-filter-list';

function order(overrides: Partial<OrderCard> = {}): OrderCard {
  return {
    id: 'order-1',
    createdAt: '2026-09-17T14:32:00.000Z',
    status: 'PAID',
    paymentNote: null,
    items: [
      {
        id: 'item-1',
        name: 'Widget',
        quantity: 1,
        lineTotal: 1000,
        currency: 'ZMW',
      },
    ],
    subtotal: 1000,
    shippingAmount: 0,
    total: 1000,
    currency: 'ZMW',
    ...overrides,
  };
}

describe('OrdersFilterList', () => {
  it('shows every order under "All", with a count per status', () => {
    render(
      <OrdersFilterList
        orders={[
          order({ id: 'order-1', status: 'PAID' }),
          order({ id: 'order-2', status: 'CANCELLED' }),
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'All (2)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Paid (1)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancelled (1)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Awaiting payment (0)' }),
    ).toBeInTheDocument();
  });

  it('filters down to only orders matching the selected status', () => {
    render(
      <OrdersFilterList
        orders={[
          order({ id: 'order-1', status: 'PAID' }),
          order({ id: 'order-2', status: 'CANCELLED' }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Paid (1)' }));

    expect(screen.getByText('order-1'.slice(0, 8))).toBeInTheDocument();
    expect(screen.queryByText('order-2'.slice(0, 8))).not.toBeInTheDocument();
  });

  it('shows an empty message when no order matches the selected filter', () => {
    render(<OrdersFilterList orders={[order({ status: 'PAID' })]} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancelled (0)' }),
    );

    expect(
      screen.getByText('No orders match this filter.'),
    ).toBeInTheDocument();
  });

  it('counts DISPATCHED and PARTIALLY_DISPATCHED orders as Shipped, but not PREPARING or CANCELLED fulfillment', () => {
    render(
      <OrdersFilterList
        orders={[
          order({ id: 'order-1', fulfillmentSummary: 'DISPATCHED' }),
          order({ id: 'order-2', fulfillmentSummary: 'PARTIALLY_DISPATCHED' }),
          order({ id: 'order-3', fulfillmentSummary: 'PREPARING' }),
          order({ id: 'order-4', fulfillmentSummary: 'CANCELLED' }),
          order({ id: 'order-5' }),
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Shipped (2)' }),
    ).toBeInTheDocument();
  });

  it('filters down to only shipped orders, and shows a badge naming how far each got', () => {
    render(
      <OrdersFilterList
        orders={[
          order({ id: 'order-1', fulfillmentSummary: 'DISPATCHED' }),
          order({ id: 'order-2', fulfillmentSummary: 'PARTIALLY_DISPATCHED' }),
          order({ id: 'order-3', fulfillmentSummary: 'PREPARING' }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shipped (2)' }));

    expect(screen.getByText('order-1'.slice(0, 8))).toBeInTheDocument();
    expect(screen.getByText('order-2'.slice(0, 8))).toBeInTheDocument();
    expect(screen.queryByText('order-3'.slice(0, 8))).not.toBeInTheDocument();
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.getByText('Partially shipped')).toBeInTheDocument();
  });

  it('shows no fulfillment badge for an order still preparing', () => {
    render(
      <OrdersFilterList
        orders={[order({ fulfillmentSummary: 'PREPARING' })]}
      />,
    );

    expect(screen.queryByText('Shipped')).not.toBeInTheDocument();
    expect(screen.queryByText('Partially shipped')).not.toBeInTheDocument();
  });

  it('shows the datestamp with a time of day, not just the date', () => {
    render(<OrdersFilterList orders={[order()]} />);

    // Matched loosely: the exact hour depends on the test runner's timezone,
    // and Node's ICU renders the month as "Sep" or "Sept" depending on build.
    expect(
      screen.getByText(/17 Sep\w* 2026,\s*\d{2}:\d{2}/),
    ).toBeInTheDocument();
  });
});
