import type { ImgHTMLAttributes } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SiteHeader } from './site-header';

// The header reads the shopper's currency cookie, which makes it an async
// server component; the store is stubbed empty so it falls back to the
// default currency.
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

// next/image demands width/height metadata a static import only carries
// under Next's own webpack loader, which this Vite-powered test runner does
// not run — a plain <img> is all the logo needs to be findable here anyway.
vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} />
  ),
}));

// The header now checks who's signed in to decide between the plain
// "Account" link and the dropdown — defaults to a signed-out visitor so most
// of this suite stays about navigation, not auth; one test below overrides
// it to cover the signed-in branch.
const session = vi.hoisted(() => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/session', () => session);

// The dropdown's sign-out item posts to a server action — irrelevant to what
// this suite checks, so it's stubbed rather than pulling in everything
// `app/account/actions` imports.
vi.mock('@/app/account/actions', () => ({ signOutAction: vi.fn() }));

describe('SiteHeader', () => {
  it('renders the primary storefront navigation', async () => {
    render(await SiteHeader());

    expect(
      screen.getByRole('link', { name: /iZyane Marketplace|Commerce/ }),
    ).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Cart' })).toHaveAttribute(
      'href',
      '/cart',
    );
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'href',
      '/account',
    );
  });

  it('submits the search field to the search route', async () => {
    render(await SiteHeader());

    const search = screen.getByLabelText('Search products');
    expect(search).toHaveAttribute('name', 'q');
    expect(search.closest('form')).toHaveAttribute('action', '/search');
  });

  it('swaps the Account link for a dropdown trigger once signed in', async () => {
    session.getCurrentUser.mockResolvedValueOnce({
      id: 'user-1',
      email: 'shopper@example.test',
      role: 'CUSTOMER',
    });

    render(await SiteHeader());

    expect(
      screen.getByRole('button', { name: /Account/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Account' }),
    ).not.toBeInTheDocument();
  });
});
