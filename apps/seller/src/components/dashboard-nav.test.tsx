import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { navigation } from '@/lib/navigation';

import { DashboardNav } from './dashboard-nav';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock('next/navigation', () => ({ usePathname }));

describe('DashboardNav', () => {
  it('renders a link for every configured section', () => {
    usePathname.mockReturnValue('/');
    render(<DashboardNav />);

    for (const item of navigation) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute(
        'href',
        item.href,
      );
    }
  });

  it('marks only the matching section as current', () => {
    usePathname.mockReturnValue('/offers');
    render(<DashboardNav />);

    expect(screen.getByRole('link', { name: 'Offers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Payouts' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps a section current on its descendant routes', () => {
    usePathname.mockReturnValue('/offers/abc-123');
    render(<DashboardNav />);

    expect(screen.getByRole('link', { name: 'Offers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not mark overview as current on another section', () => {
    usePathname.mockReturnValue('/offers');
    render(<DashboardNav />);

    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
