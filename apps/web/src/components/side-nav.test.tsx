import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SideNav } from './side-nav';

describe('SideNav', () => {
  it('links the quick links to their routes', () => {
    render(<SideNav />);

    expect(screen.getByRole('link', { name: 'Deals' })).toHaveAttribute(
      'href',
      '/deals',
    );
  });

  it('links the account and support shortcuts to their routes', () => {
    render(<SideNav />);

    expect(screen.getByRole('link', { name: /My Wishlist/ })).toHaveAttribute(
      'href',
      '/account?tab=wishlist',
    );
    expect(screen.getByRole('link', { name: /My Orders/ })).toHaveAttribute(
      'href',
      '/account?tab=orders',
    );
    expect(
      screen.getByRole('link', { name: /Help & Support/ }),
    ).toHaveAttribute('href', '/help');
  });
});
