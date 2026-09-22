import type { BackendUser } from '@commerce/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { navigationFor } from '@/lib/navigation';

import { DashboardNav } from './dashboard-nav';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock('next/navigation', () => ({ usePathname }));

const user: BackendUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'someone@commerce.test',
  role: 'ADMIN',
};

const navigation = navigationFor(user);

describe('DashboardNav', () => {
  it('renders a link for every configured section', () => {
    usePathname.mockReturnValue('/');
    render(<DashboardNav user={user} />);

    for (const item of navigation) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute(
        'href',
        item.href,
      );
    }
  });

  it('marks only the matching section as current', () => {
    usePathname.mockReturnValue('/catalog');
    render(<DashboardNav user={user} />);

    expect(screen.getByRole('link', { name: 'Catalog' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Finance' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps a section current on its descendant routes', () => {
    usePathname.mockReturnValue('/catalog/abc-123');
    render(<DashboardNav user={user} />);

    expect(screen.getByRole('link', { name: 'Catalog' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not mark overview as current on another section', () => {
    usePathname.mockReturnValue('/catalog');
    render(<DashboardNav user={user} />);

    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
