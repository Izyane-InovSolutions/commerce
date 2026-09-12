import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SiteHeader } from './site-header';

// The header reads the shopper's currency cookie, which makes it an async
// server component; the store is stubbed empty so it falls back to the
// default currency.
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

describe('SiteHeader', () => {
  it('renders the primary storefront navigation', async () => {
    render(await SiteHeader());

    expect(screen.getByRole('link', { name: 'Commerce' })).toHaveAttribute(
      'href',
      '/',
    );
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
});
