import {
  Boxes,
  Building2,
  ChartLine,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  Star,
  Tags,
  Truck,
  Wallet,
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
    href: '/offers',
    label: 'Offers',
    icon: Tags,
  },
  {
    href: '/inventory',
    label: 'Inventory',
    icon: Boxes,
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: ClipboardList,
  },
  {
    href: '/fulfillment',
    label: 'Fulfillment',
    icon: Truck,
  },
  {
    href: '/earnings',
    label: 'Earnings',
    icon: Wallet,
  },
  {
    href: '/payouts',
    label: 'Payouts',
    icon: Landmark,
  },
  {
    href: '/reviews',
    label: 'Reviews',
    icon: Star,
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: ChartLine,
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: Building2,
  },
];
