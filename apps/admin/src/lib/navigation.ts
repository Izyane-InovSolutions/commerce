import type { BackendUser } from '@commerce/contracts';
import {
  Boxes,
  ChartLine,
  ClipboardList,
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
  RotateCcw,
  Store,
  Tag,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Hidden from STAFF because every admin route the section reads is
   * `@Roles(Role.ADMIN)` in the Commerce API. A section whose reads staff may
   * make stays visible even when some of its actions are ADMIN-only; those
   * actions are refused by `guardAction(true)` and the API instead.
   */
  adminOnly?: boolean;
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
    adminOnly: true,
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
    adminOnly: true,
  },
  {
    href: '/returns',
    label: 'Returns',
    icon: Undo2,
  },
  {
    href: '/inventory',
    label: 'Inventory',
    icon: Boxes,
  },
  {
    href: '/procurement',
    label: 'Procurement',
    icon: ClipboardList,
  },
  {
    href: '/operations',
    label: 'Operations',
    icon: RotateCcw,
    adminOnly: true,
  },
  {
    href: '/promotions',
    label: 'Promotions',
    icon: Percent,
    adminOnly: true,
  },
  {
    href: '/moderation',
    label: 'Moderation',
    icon: MessageSquare,
    adminOnly: true,
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
    adminOnly: true,
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
    adminOnly: true,
  },
  {
    href: '/audit',
    label: 'Audit',
    icon: ScrollText,
    adminOnly: true,
  },
];

/**
 * Navigation for a signed-in user.
 *
 * ADMIN sees every section; STAFF sees those the API lets staff read (see
 * `adminOnly`), so the nav never offers a page that would only bounce them to
 * `/?access=restricted`. Promotions is a placeholder with no backend yet and
 * stays administrator-only until one exists; Support, also a placeholder, is
 * open to staff like the page itself. Any other role gets nothing — the portal
 * is not for them.
 */
export function navigationFor(user: BackendUser): NavItem[] {
  if (user.role === 'ADMIN') return navigation;
  if (user.role !== 'STAFF') return [];
  return navigation.filter((item) => !item.adminOnly);
}
