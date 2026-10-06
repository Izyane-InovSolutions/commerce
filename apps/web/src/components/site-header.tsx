import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, User, Package, Heart } from 'lucide-react';

import izyaneLogo from '@/assets/izyane-black.svg';
import { AccountMenu } from '@/components/account-menu';
import { MegaMenu } from '@/components/mega-menu';
import { NotificationDrawer } from '@/components/notification-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signOutAction } from '@/app/account/actions';
import { unreadBadgeLabel } from '@/lib/notification-link';
import { countUnreadNotifications } from '@/lib/notifications';
import { getCurrentUser } from '@/lib/session';
import { listBrands, listCategories, listStorefronts } from '@/lib/catalog';
import { buildCategoryTree, groupBrandsByLetter } from '@/lib/menu-data';
import { pageFrame } from '@/lib/page-frame';
const linkClasses =
  'block rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300';


export async function SiteHeader() {
  const user = await getCurrentUser();
  // Zero whenever it can't be told (signed out, API without notifications)
  // — `countUnreadNotifications` never throws, so the header never breaks.
  const unread = user ? unreadBadgeLabel(await countUnreadNotifications()) : null;
  // The shop bar is navigation, not content: if the catalog can't be read it
  // shows just its fixed links rather than taking the header down.
  const [categories, brands, stores] = await Promise.all([
    listCategories().catch(() => []),
    listBrands().catch(() => []),
    listStorefronts().catch(() => []),
  ]);

  return (
    <header className="bg-background sticky top-0 z-40 border-b-4 border-primary">
      <div className={`${pageFrame} flex flex-wrap items-center gap-4 py-3`}>
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
          <ul>
        <Button
            variant="ghost"
            size="sm"
            asChild
            className="hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
          >
          <Link
            href="/account?tab=wishlist"
            className={`${linkClasses} flex items-center gap-2 font-medium`}
          >
            <Heart className="size-4" aria-hidden="true" />
            My Wishlist
          </Link>
        </Button>
        <Button
            variant="ghost"
            size="sm"
            asChild
            className="hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300"
          >
          <Link
            href="/account?tab=orders"
            className={`${linkClasses} flex items-center gap-2 font-medium`}
          >
            <Package className="size-4" aria-hidden="true" />
            My Orders
          </Link>
        </Button>
      </ul>
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
          {user ? <NotificationDrawer unread={unread} /> : null}
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
          
        </nav>
      </div>
      <div className="border-t">
        <div className={pageFrame}>
          <MegaMenu
            categories={buildCategoryTree(categories)}
            brands={groupBrandsByLetter(brands)}
            stores={stores}
          />
        </div>
      </div>
    </header>
  );
}
