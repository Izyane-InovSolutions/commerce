import type { BackendUser } from '@commerce/contracts';
import {
  Boxes,
  Building2,
  ChartLine,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  Percent,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sub-views of a section, shown beneath it when the section is active. */
  children?: { href: string; label: string }[];
};

/** Section navigation for an approved seller, in display order. */
export const navigation: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/products',
    label: 'Products',
    icon: Package,
    children: [
      { href: '/products', label: 'My Products' },
      { href: '/products/new', label: 'Add Product' },
      { href: '/products?view=draft', label: 'Drafts' },
      { href: '/products?view=pending', label: 'Pending Approval' },
      { href: '/products?view=active', label: 'Approved' },
      { href: '/products?view=rejected', label: 'Rejected' },
    ],
  },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/promotions', label: 'Promotions', icon: Percent },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/analytics', label: 'Analytics', icon: ChartLine },
  { href: '/settings', label: 'Store Settings', icon: Building2 },
];

/**
 * Navigation for a signed-in user.
 *
 * Every section is listed regardless of role, because the Commerce API has no
 * seller domain yet: there is nothing to gate on beyond the role string, and
 * each section says for itself what it is waiting for.
 */
export function navigationFor(user: BackendUser): NavItem[] {
  void user;
  return navigation;
}
