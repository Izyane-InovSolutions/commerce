import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TransactionsAreaChart } from './transactions-area-chart';
import { sampleTransactionSeries } from '@/lib/sample-transactions';

describe('TransactionsAreaChart', () => {
  it('renders the card, with a range control defaulting to 12 months', () => {
    render(
      <TransactionsAreaChart
        data={sampleTransactionSeries(365, new Date('2026-09-25'))}
      />,
    );

    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByLabelText('Date range')).toHaveValue('12');
    expect(
      screen.getByText(
        'Card and mobile money transaction volume for the last 12 months.',
      ),
    ).toBeInTheDocument();
  });

  it('switches its description when a shorter range is chosen', async () => {
    const { getByLabelText, getByText } = render(
      <TransactionsAreaChart
        data={sampleTransactionSeries(365, new Date('2026-09-25'))}
      />,
    );

    const select = getByLabelText('Date range') as HTMLSelectElement;
    select.value = '3';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(
      await getByText(
        'Card and mobile money transaction volume for the last 3 months.',
      ),
    ).toBeInTheDocument();
  });
});
