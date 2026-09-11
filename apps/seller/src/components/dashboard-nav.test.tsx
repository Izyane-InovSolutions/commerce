import type { User } from '@commerce/contracts';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { navigationFor } from '@/lib/navigation';

import { DashboardNav } from './dashboard-nav';

const { usePathname, useSearchParams } = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname, useSearchParams }));

function at(pathname: string, search = ''): void {
  usePathname.mockReturnValue(pathname);
  useSearchParams.mockReturnValue(new URLSearchParams(search));
}

const seller: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'seller@deskworks.test',
  name: 'Dara Okoro',
  roles: ['customer', 'seller'],
  sellerId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-01-15T09:00:00.000Z',
};

const shopper: User = {
  ...seller,
  roles: ['customer'],
  sellerId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardNav', () => {
  it('renders a link for every section a seller can reach', () => {
    at('/');
    render(<DashboardNav user={seller} />);

    for (const item of navigationFor(seller)) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute(
        'href',
        item.href,
      );
    }
  });

  it('offers only onboarding to someone without a store', () => {
    at('/');
    render(<DashboardNav user={shopper} />);

    expect(screen.getByRole('link', { name: 'Apply to sell' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Products' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Payments' })).toBeNull();
  });

  it('marks only the matching section as current', () => {
    at('/inventory');
    render(<DashboardNav user={seller} />);

    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Payments' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps a section current on its descendant routes', () => {
    at('/orders/abc-123');
    render(<DashboardNav user={seller} />);

    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not mark the dashboard as current on another section', () => {
    at('/inventory');
    render(<DashboardNav user={seller} />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('hides a section`s sub-views until that section is active', () => {
    at('/inventory');
    render(<DashboardNav user={seller} />);
    expect(screen.queryByRole('link', { name: 'Drafts' })).toBeNull();
  });

  it('reveals the sub-views of the active section', () => {
    at('/products');
    render(<DashboardNav user={seller} />);

    for (const label of [
      'My Products',
      'Add Product',
      'Drafts',
      'Pending Approval',
      'Approved',
      'Rejected',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
  });

  it('marks the sub-view that matches the query string', () => {
    at('/products', 'view=draft');
    render(<DashboardNav user={seller} />);

    expect(screen.getByRole('link', { name: 'Drafts' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Pending Approval' }),
    ).not.toHaveAttribute('aria-current');
    // "My Products" is the unfiltered list, so it is not current here.
    expect(
      screen.getByRole('link', { name: 'My Products' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('keeps sub-views visible on a product detail route', () => {
    at('/products/abc-123');
    render(<DashboardNav user={seller} />);
    expect(screen.getByRole('link', { name: 'Drafts' })).toBeVisible();
  });
});
