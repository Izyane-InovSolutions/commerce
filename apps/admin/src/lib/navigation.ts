import type { BackendUser } from '@commerce/contracts';
import {
  Boxes,
  ChartLine,
  FolderTree,
  CreditCard,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Package,
  Percent,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Section navigation for the portal, in display order. */
export const navigation: NavItem[] = [
  {
    href: '/',
    label: 'Overview',
    icon: LayoutDashboard,
  },
  {
    href: '/catalog',
    label: 'Catalog',
    icon: Package,
  },
  {
    href: '/categories',
    label: 'Categories',
    icon: FolderTree,
  },
  {
    href: '/brands',
    label: 'Brands',
    icon: Tag,
  },
  {
    href: '/sellers',
    label: 'Sellers',
    icon: Store,
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: ShoppingCart,
  },
  {
    href: '/payments',
    label: 'Payments',
    icon: CreditCard,
  },
  {
    href: '/inventory',
    label: 'Inventory',
    icon: Boxes,
  },
  {
    href: '/fulfillment',
    label: 'Fulfillment',
    icon: Truck,
  },
  {
    href: '/promotions',
    label: 'Promotions',
    icon: Percent,
  },
  {
    href: '/moderation',
    label: 'Moderation',
    icon: MessageSquare,
  },
  {
    href: '/support',
    label: 'Support',
    icon: LifeBuoy,
  },
  {
    href: '/finance',
    label: 'Finance',
    icon: Landmark,
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: ChartLine,
  },
  {
    href: '/security',
    label: 'Security',
    icon: ShieldCheck,
  },
  {
    href: '/audit',
    label: 'Audit',
    icon: ScrollText,
  },
];

/**
 * Navigation for a signed-in user.
 *
 * Admin sections are all one role, so this is a straight pass-through today;
 * it exists so finer-grained roles have somewhere to land.
 */
export function navigationFor(user: BackendUser): NavItem[] {
  return user.role === 'ADMIN' || user.role === 'STAFF' ? navigation : [];
}
