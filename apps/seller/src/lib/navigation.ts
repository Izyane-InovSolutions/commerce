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
      { href: '/products/new', label: 'List a Product' },
      { href: '/products?status=DRAFT', label: 'Drafts' },
      { href: '/products?status=PUBLISHED', label: 'Published' },
      { href: '/products?status=ARCHIVED', label: 'Archived' },
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
 * Every section is listed regardless of role. What actually gates a section is
 * the seller account behind the user — the API answers 403 until it is
 * approved — and each section resolves that for itself, so the menu stays the
 * same shape whether an application is pending or approved.
 */
export function navigationFor(user: BackendUser): NavItem[] {
  void user;
  return navigation;
}
