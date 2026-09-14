import Link from 'next/link';
import { CircleQuestionMark, Heart, Menu, Package } from 'lucide-react';

import { Separator } from '@/components/ui/separator';

const categoryLinks = [
  { label: 'All Products', href: '/products' },
  { label: 'New Arrivals', href: '/new-arrivals' },
  { label: 'Best Sellers', href: '/best-sellers' },
  { label: 'Deals', href: '/deals' },
] as const;

const linkClasses =
  'block rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300';

export function SideNav() {
  return (
    <nav
      aria-label="Storefront"
      className="w-full space-y-4 sm:w-56 sm:shrink-0"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
          <Menu className="size-4" aria-hidden="true" />
          Categories
        </div>
        <ul>
          {categoryLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`${linkClasses} pl-8 text-muted-foreground`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Separator />

      <ul>
        <li>
          <Link
            href="/wishlist"
            className={`${linkClasses} flex items-center gap-2 font-medium`}
          >
            <Heart className="size-4" aria-hidden="true" />
            My Wishlist
          </Link>
        </li>
        <li>
          <Link
            href="/orders"
            className={`${linkClasses} flex items-center gap-2 font-medium`}
          >
            <Package className="size-4" aria-hidden="true" />
            My Orders
          </Link>
        </li>
      </ul>

      <Separator />

      <Link
        href="/help"
        className={`${linkClasses} flex items-center gap-2 text-muted-foreground`}
      >
        <CircleQuestionMark className="size-4" aria-hidden="true" />
        Help & Support
      </Link>
    </nav>
  );
}
