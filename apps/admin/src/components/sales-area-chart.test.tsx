import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { BackendSalesAnalyticsPoint } from '@commerce/contracts';

import { SalesAreaChart } from './sales-area-chart';

const series: BackendSalesAnalyticsPoint[] = Array.from(
  { length: 90 },
  (_, index) => ({
    periodStart: new Date(Date.UTC(2026, 6, 1 + index)).toISOString(),
    orderCount: index % 5,
    grossAmount: (index % 5) * 12_500,
  }),
);

const RANGES = [
  { days: 90, label: 'for the last 3 months' },
  { days: 30, label: 'for the last 30 days' },
  { days: 7, label: 'for the last 7 days' },
];

describe('SalesAreaChart', () => {
  it('renders the card, with a range control defaulting to the first range', () => {
    render(
      <SalesAreaChart
        description="Gross paid-order sales"
        series={series}
        currency="ZMW"
        interval="day"
        ranges={RANGES}
      />,
    );

    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByLabelText('Date range')).toHaveValue('90');
    expect(
      screen.getByText('Gross paid-order sales for the last 3 months.'),
    ).toBeInTheDocument();
  });

  it('switches its description when a shorter range is chosen', () => {
    render(
      <SalesAreaChart
        description="Gross paid-order sales"
        series={series}
        currency="ZMW"
        interval="day"
        ranges={RANGES}
      />,
    );

    fireEvent.change(screen.getByLabelText('Date range'), {
      target: { value: '7' },
    });

    expect(
      screen.getByText('Gross paid-order sales for the last 7 days.'),
    ).toBeInTheDocument();
  });

  it('offers no range control without ranges, and says so when empty', () => {
    render(
      <SalesAreaChart
        description="Gross paid-order sales."
        series={[]}
        currency="ZMW"
        interval="week"
      />,
    );

    expect(screen.queryByLabelText('Date range')).not.toBeInTheDocument();
    expect(screen.getByText('No sales in this range.')).toBeInTheDocument();
  });
});
