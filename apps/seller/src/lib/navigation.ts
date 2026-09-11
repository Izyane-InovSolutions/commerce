import type { User } from '@commerce/contracts';
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

/** What someone who has not been approved to sell yet can reach. */
const onboardingNavigation: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/apply', label: 'Apply to sell', icon: Building2 },
];

/**
 * Navigation for a signed-in user.
 *
 * Trading sections are hidden until a seller account exists, so nobody is
 * offered a link that would only bounce them back to onboarding.
 */
export function navigationFor(user: User): NavItem[] {
  return user.sellerId && user.roles.includes('seller')
    ? navigation
    : onboardingNavigation;
}
