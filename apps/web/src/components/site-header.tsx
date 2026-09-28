import Image from 'next/image';
import Link from 'next/link';
import { Bell, ShoppingCart, User } from 'lucide-react';

import izyaneLogo from '@/assets/izyane-black.svg';
import { AccountMenu } from '@/components/account-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signOutAction } from '@/app/account/actions';
import { unreadBadgeLabel } from '@/lib/notification-link';
import { countUnreadNotifications } from '@/lib/notifications';
import { getCurrentUser } from '@/lib/session';

export async function SiteHeader() {
  const user = await getCurrentUser();
  // Zero whenever it can't be told (signed out, API without notifications)
  // — `countUnreadNotifications` never throws, so the header never breaks.
  const unread = user ? unreadBadgeLabel(await countUnreadNotifications()) : null;

  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link
          href="/"
          aria-label="iZyane Marketplace"
          className="flex items-center gap-1.5 text-base font-semibold tracking-tight"
        >
          <Image src={izyaneLogo} alt="" className="h-6 w-auto" priority />
          
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
          {user ? (
            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              className="relative hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
            >
              <Link
                href="/notifications"
                aria-label={
                  unread ? `Notifications, ${unread} unread` : 'Notifications'
                }
              >
                <Bell />
                {unread ? (
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] leading-none font-semibold text-white"
                  >
                    {unread}
                  </span>
                ) : null}
              </Link>
            </Button>
          ) : null}
          {user ? (
            <AccountMenu email={user.email} signOut={signOutAction} />
          ) : (
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
          )}
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
