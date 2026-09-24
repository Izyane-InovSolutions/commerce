import Link from 'next/link';
import { CircleQuestionMark, Heart, Menu, Package } from 'lucide-react';

import { Separator } from '@/components/ui/separator';

import type { Category } from '@/lib/catalog-types';

const quickLinks = [
  { label: 'All Products', href: '/products' },
  { label: 'Trending', href: '/products?filter=trending' },
  { label: 'New Arrivals', href: '/products?filter=new-arrivals' },
  { label: 'Best Sellers', href: '/best-sellers' },
  { label: 'Deals', href: '/deals' },
] as const;

const linkClasses =
  'block rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300';

export function SideNav({ categories = [] }: { categories?: Category[] }) {
  return (
    <nav
      aria-label="Storefront"
      // top-14 matches the site header's own rendered height, so the sidenav
      // sticks directly beneath it rather than under (or overlapping) it —
      // both are sticky now, stacked.
      className="w-full space-y-4 sm:sticky sm:top-14 sm:h-[calc(100vh-3.5rem)] sm:w-56 sm:shrink-0 sm:self-start sm:overflow-y-auto"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
          <Menu className="size-4" aria-hidden="true" />
          Categories
        </div>
        <ul>
          {quickLinks.map((link) => (
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

      {categories.length > 0 ? (
        <>
          <Separator />
          <div className="space-y-1">
            <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Shop by Category
            </div>
            <ul>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/products?category=${encodeURIComponent(category.slug)}`}
                    className={`${linkClasses} text-muted-foreground`}
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      <Separator />

      <ul>
        <li>
          <Link
            href="/account?tab=wishlist"
            className={`${linkClasses} flex items-center gap-2 font-medium`}
          >
            <Heart className="size-4" aria-hidden="true" />
            My Wishlist
          </Link>
        </li>
        <li>
          <Link
            href="/account?tab=orders"
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
