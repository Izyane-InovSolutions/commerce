import Link from 'next/link';
import { ShoppingCart, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Commerce
        </Link>

        <form
          action="/search"
          className="order-last w-full sm:order-none sm:flex-1"
        >
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <Input
            id="site-search"
            name="q"
            type="search"
            placeholder="Search products"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/account">
              <User data-icon="inline-start" />
              Account
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/cart">
              <ShoppingCart data-icon="inline-start" />
              Cart
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
