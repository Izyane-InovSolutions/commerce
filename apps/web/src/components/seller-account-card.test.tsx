import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SellerAccountCard } from './seller-account-card';
import type { OwnSeller } from '@/lib/sellers';

function noop(): Promise<void> {
  return Promise.resolve();
}

describe('SellerAccountCard', () => {
  it('offers to become a seller when there is no application yet', () => {
    render(
      <SellerAccountCard
        seller={null}
        becomeSeller={noop}
        goToDashboard={noop}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Become a seller' }),
    ).toBeInTheDocument();
  });

  it('offers to resubmit a rejected application', () => {
    const seller: OwnSeller = {
      status: 'REJECTED',
      businessName: 'Acme',
      reviewReason: 'Missing documents',
    };

    render(
      <SellerAccountCard
        seller={seller}
        becomeSeller={noop}
        goToDashboard={noop}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Resubmit application' }),
    ).toBeInTheDocument();
  });

  it('links to the dashboard for an approved seller', () => {
    const seller: OwnSeller = {
      status: 'APPROVED',
      businessName: 'Acme',
      reviewReason: null,
    };

    render(
      <SellerAccountCard
        seller={seller}
        becomeSeller={noop}
        goToDashboard={noop}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Go to seller dashboard' }),
    ).toBeInTheDocument();
  });

  it('shows a pending application status without a dashboard link label', () => {
    const seller: OwnSeller = {
      status: 'PENDING',
      businessName: 'Acme',
      reviewReason: null,
    };

    render(
      <SellerAccountCard
        seller={seller}
        becomeSeller={noop}
        goToDashboard={noop}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'View application status' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/under review/i)).toBeInTheDocument();
  });

  it('renders without crashing when the actions are wired to real functions', () => {
    const action = vi.fn(() => Promise.resolve());
    render(
      <SellerAccountCard seller={null} becomeSeller={action} goToDashboard={action} />,
    );
    expect(screen.getByText('Selling')).toBeInTheDocument();
  });
});
