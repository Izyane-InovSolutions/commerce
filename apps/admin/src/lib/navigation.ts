import {
  Boxes,
  ChartLine,
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
