import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, User } from 'lucide-react';

import izyaneLogo from '@/assets/izyane-black.svg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export async function SiteHeader() {
  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link
          href="/"
          aria-label="iZyane Marketplace"
          className="flex items-center gap-1.5 text-base font-semibold tracking-tight"
        >
          <Image src={izyaneLogo} alt="" className="h-6 w-auto" priority />
          Marketplace
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
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
          >
            <Link href="/account">
              <User data-icon="inline-start" />
              Account
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
          >
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
