import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AccountTabs } from './account-tabs';

// Actually switching tabs is exercised in a real browser (jsdom's pointer
// event support is too thin for Radix's activation to fire here) — this
// only checks the structure this component is responsible for.
describe('AccountTabs', () => {
  it('shows Recently viewed as the default panel, with the rest unmounted', () => {
    render(
      <AccountTabs
        recentlyViewed={<p>Recently viewed panel</p>}
        wishlist={<p>Wishlist panel</p>}
        savedSellers={<p>Saved sellers panel</p>}
        orders={<p>Orders panel</p>}
        addresses={<p>Addresses panel</p>}
      />,
    );

    expect(screen.getByText('Recently viewed panel')).toBeVisible();
    expect(screen.queryByText('Wishlist panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Saved sellers panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Orders panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Addresses panel')).not.toBeInTheDocument();
  });

  it('lists all five tabs', () => {
    render(
      <AccountTabs
        recentlyViewed={<p>A</p>}
        wishlist={<p>B</p>}
        savedSellers={<p>E</p>}
        orders={<p>C</p>}
        addresses={<p>D</p>}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Recently viewed' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Wishlist' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Saved sellers' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My addresses' })).toBeInTheDocument();
  });

  it('opens on the requested tab, for a link that points at Orders or Wishlist directly', () => {
    render(
      <AccountTabs
        defaultTab="orders"
        recentlyViewed={<p>Recently viewed panel</p>}
        wishlist={<p>Wishlist panel</p>}
        savedSellers={<p>Saved sellers panel</p>}
        orders={<p>Orders panel</p>}
        addresses={<p>Addresses panel</p>}
      />,
    );

    expect(screen.getByText('Orders panel')).toBeVisible();
    expect(
      screen.queryByText('Recently viewed panel'),
    ).not.toBeInTheDocument();
  });
});
