import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SiteHeader } from './site-header';

describe('SiteHeader', () => {
  it('renders the primary storefront navigation', () => {
    render(<SiteHeader />);

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

  it('submits the search field to the search route', () => {
    render(<SiteHeader />);

    const search = screen.getByLabelText('Search products');
    expect(search).toHaveAttribute('name', 'q');
    expect(search.closest('form')).toHaveAttribute('action', '/search');
  });
});
