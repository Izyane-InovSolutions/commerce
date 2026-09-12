import type { BackendUser } from '@commerce/contracts';
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

const seller: BackendUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'seller@commerce.test',
  role: 'SELLER',
};

const shopper: BackendUser = {
  ...seller,
  role: 'CUSTOMER',
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

  it('shows every section regardless of role', () => {
    // The Commerce API has no seller domain, so there is nothing to gate on;
    // each section states for itself what it is waiting for.
    at('/');
    render(<DashboardNav user={shopper} />);

    expect(screen.getByRole('link', { name: 'Products' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Payments' })).toBeVisible();
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
      'List a Product',
      'Drafts',
      'Published',
      'Archived',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
  });

  it('marks the sub-view that matches the query string', () => {
    at('/products', 'status=DRAFT');
    render(<DashboardNav user={seller} />);

    expect(screen.getByRole('link', { name: 'Drafts' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Published' })).not.toHaveAttribute(
      'aria-current',
    );
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
