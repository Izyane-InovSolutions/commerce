'use client';

import Link from 'next/link';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { NavigationMenu } from 'radix-ui';
import {
  ChevronDown,
  Flame,
  Heart,
  History,
  LifeBuoy,
  Menu,
  Package,
  RotateCcw,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';

import type { StorefrontListing } from '@/lib/catalog-types';
import type { BrandGroup, CategoryBranch } from '@/lib/menu-data';
import { cn } from '@/lib/utils';

/** Where a shopper usually wants to go next, whatever they're browsing. */
const QUICK_LINKS = [
  { href: '/deals', label: 'Hot deals', icon: Flame },
  { href: '/new-arrivals', label: 'New arrivals', icon: Sparkles },
  { href: '/best-sellers', label: 'Best sellers', icon: TrendingUp },
  {
    href: '/account?tab=recently-viewed',
    label: 'Recently viewed',
    icon: History,
  },
  { href: '/account?tab=wishlist', label: 'Your wishlist', icon: Heart },
  { href: '/account?tab=returns', label: 'Returns', icon: RotateCcw },
  { href: '/help', label: 'Help', icon: LifeBuoy },
  { href: '/account', label: 'Sell on iZyane', icon: Store },
] as const;

/** The three the bar itself carries, so they're one click away. */
const BAR_LINKS = QUICK_LINKS.slice(0, 3);

const categoryHref = (slug: string) =>
  `/products?category=${encodeURIComponent(slug)}`;
const brandHref = (slug: string) =>
  `/products?brand=${encodeURIComponent(slug)}`;

const barItem =
  'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-blue-50 data-[state=open]:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-300 dark:data-[state=open]:bg-blue-950 dark:data-[state=open]:text-blue-300';

const panelLink =
  'block rounded-md px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * The shop bar under the header: Categories and Brands open full-width
 * panels, the most-used destinations sit directly in the bar, and every
 * panel repeats the quick links down its right edge.
 *
 * Desktop uses Radix NavigationMenu for hover intent, keyboard movement and
 * focus handling; below `md` the same content folds into one "Shop" panel
 * of disclosures, which reads better on a phone than stacked hover menus.
 */
export function MegaMenu({
  categories,
  brands,
  stores = [],
}: {
  categories: CategoryBranch[];
  brands: BrandGroup[];
  /** Marketplace stores with a public page, for shopping by store. */
  stores?: StorefrontListing[];
}) {
  const shown = storesToShow(stores);
  return (
    <>
      <DesktopMenu categories={categories} brands={brands} stores={shown} />
      <MobileMenu categories={categories} brands={brands} stores={shown} />
    </>
  );
}

/** Stores with a page to go to, busiest first. */
function storesToShow(stores: StorefrontListing[]): StorefrontListing[] {
  return stores
    .filter((store) => store.storefrontSlug)
    .sort(
      (left, right) =>
        right.listingCount - left.listingCount ||
        (left.displayName ?? '').localeCompare(right.displayName ?? ''),
    );
}

const STORE_PANEL_LIMIT = 12;

function storeName(store: StorefrontListing): string {
  return store.displayName ?? 'Marketplace store';
}

function DesktopMenu({
  categories,
  brands,
  stores,
}: {
  categories: CategoryBranch[];
  brands: BrandGroup[];
  stores: StorefrontListing[];
}) {
  return (
    <NavigationMenu.Root
      aria-label="Shop"
      delayDuration={120}
      className="relative hidden md:block"
    >
      <NavigationMenu.List className="flex items-center gap-1 py-1.5">
        {categories.length > 0 ? (
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className={cn(barItem, 'group')}>
              <Menu className="size-4" aria-hidden="true" />
              Categories
              <ChevronDown
                className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </NavigationMenu.Trigger>
            <NavigationMenu.Content>
              <CategoriesPanel categories={categories} />
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        ) : null}

        {brands.length > 0 ? (
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className={cn(barItem, 'group')}>
              Brands
              <ChevronDown
                className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </NavigationMenu.Trigger>
            <NavigationMenu.Content>
              <BrandsPanel brands={brands} />
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        ) : null}

        {stores.length > 0 ? (
          <NavigationMenu.Item>
            <NavigationMenu.Trigger className={cn(barItem, 'group')}>
              <Store className="size-4" aria-hidden="true" />
              Stores
              <ChevronDown
                className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </NavigationMenu.Trigger>
            <NavigationMenu.Content>
              <StoresPanel stores={stores} />
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        ) : null}

        <li aria-hidden="true" className="bg-border mx-1 h-5 w-px" />

        {BAR_LINKS.map(({ href, label, icon: Icon }) => (
          <NavigationMenu.Item key={href}>
            <NavigationMenu.Link asChild>
              <Link href={href} className={barItem}>
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        ))}


        <NavigationMenu.Item className="ml-auto">
          <NavigationMenu.Link asChild>
            <Link href="/account" className={barItem}>
              <Store className="size-4" aria-hidden="true" />
              Become a seller
            </Link>
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <div className="absolute inset-x-0 top-full z-50">
        <NavigationMenu.Viewport className="bg-background mt-px w-full overflow-hidden rounded-b-xl border border-t-0 shadow-lg data-[state=closed]:hidden" />
      </div>
    </NavigationMenu.Root>
  );
}

/** A panel's body with the quick links down its right edge. */
function PanelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_14rem]">
      <div className="min-w-0 p-5">{children}</div>
      <aside className="bg-muted/40 border-l p-5">
        <p className="text-muted-foreground mb-2 px-2 text-xs font-medium">
          Quick links
        </p>
        <ul>
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <NavigationMenu.Link asChild>
                <Link
                  href={href}
                  className={cn(panelLink, 'flex items-center gap-2')}
                >
                  <Icon
                    className="text-muted-foreground size-4"
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </NavigationMenu.Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function CategoriesPanel({ categories }: { categories: CategoryBranch[] }) {
  const [activeId, setActiveId] = useState(categories[0]?.category.id);
  const active =
    categories.find((branch) => branch.category.id === activeId) ??
    categories[0]!;

  return (
    <PanelFrame>
      <div className="grid grid-cols-[13rem_1fr] gap-6">
        {/* Hovering or focusing a top-level category shows its children;
            clicking it still goes to the whole category. */}
        <ul className="border-r pr-3">
          {categories.map((branch) => (
            <li key={branch.category.id}>
              <NavigationMenu.Link asChild>
                <Link
                  href={categoryHref(branch.category.slug)}
                  onMouseEnter={() => setActiveId(branch.category.id)}
                  onFocus={() => setActiveId(branch.category.id)}
                  aria-current={
                    branch.category.id === active.category.id
                      ? 'true'
                      : undefined
                  }
                  className={cn(
                    panelLink,
                    'flex items-center justify-between font-medium',
                    branch.category.id === active.category.id &&
                      'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                  )}
                >
                  {branch.category.name}
                  {branch.children.length > 0 ? (
                    // Visual hint only; the sub-categories themselves are
                    // listed beside it, so a screen reader needn't hear it.
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground text-xs font-normal"
                    >
                      {branch.children.length}
                    </span>
                  ) : null}
                </Link>
              </NavigationMenu.Link>
            </li>
          ))}
        </ul>

        <div className="min-w-0 space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-base font-semibold">{active.category.name}</p>
            <NavigationMenu.Link asChild>
              <Link
                href={categoryHref(active.category.slug)}
                className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
              >
                Shop all {active.category.name}
              </Link>
            </NavigationMenu.Link>
          </div>
          {active.category.description ? (
            <p className="text-muted-foreground max-w-prose text-sm">
              {active.category.description}
            </p>
          ) : null}
          {active.children.length > 0 ? (
            <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 lg:grid-cols-3">
              {active.children.map((child) => (
                <li key={child.id}>
                  <NavigationMenu.Link asChild>
                    <Link href={categoryHref(child.slug)} className={panelLink}>
                      {child.name}
                    </Link>
                  </NavigationMenu.Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No sub-categories — everything is under {active.category.name}.
            </p>
          )}
        </div>
      </div>
    </PanelFrame>
  );
}

function BrandsPanel({ brands }: { brands: BrandGroup[] }) {
  return (
    <PanelFrame>
      <div className="columns-2 gap-8 lg:columns-4">
        {brands.map((group) => (
          <div key={group.letter} className="mb-4 break-inside-avoid">
            <p className="text-muted-foreground mb-1 px-2 text-xs font-semibold">
              {group.letter}
            </p>
            <ul>
              {group.brands.map((brand) => (
                <li key={brand.id}>
                  <NavigationMenu.Link asChild>
                    <Link href={brandHref(brand.slug)} className={panelLink}>
                      {brand.name}
                    </Link>
                  </NavigationMenu.Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

function StoresPanel({ stores }: { stores: StorefrontListing[] }) {
  return (
    <PanelFrame>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-base font-semibold">Shop by store</p>
          <NavigationMenu.Link asChild>
            <Link
              href="/stores"
              className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
            >
              See all {stores.length} stores
            </Link>
          </NavigationMenu.Link>
        </div>
        <ul className="grid grid-cols-2 gap-1 lg:grid-cols-3">
          {stores.slice(0, STORE_PANEL_LIMIT).map((store) => (
            <li key={store.id}>
              <NavigationMenu.Link asChild>
                <Link
                  href={`/sellers/${store.storefrontSlug}`}
                  className={cn(panelLink, 'block')}
                >
                  <span className="block font-medium">{storeName(store)}</span>
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    {store.ratingCount > 0 && store.averageRating ? (
                      <>
                        <Star className="size-3" aria-hidden="true" />
                        {store.averageRating.toFixed(1)} ·{' '}
                      </>
                    ) : null}
                    {store.listingCount}{' '}
                    {store.listingCount === 1 ? 'product' : 'products'}
                  </span>
                </Link>
              </NavigationMenu.Link>
            </li>
          ))}
        </ul>
      </div>
    </PanelFrame>
  );
}

function MobileMenu({
  categories,
  brands,
  stores,
}: {
  categories: CategoryBranch[];
  brands: BrandGroup[];
  stores: StorefrontListing[];
}) {
  const [open, setOpen] = useState(false);

  // Close behind any link followed from the panel — including one that only
  // changes the query string (another category), which keeps the path.
  function closeOnLink(event: MouseEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  }

  return (
    <div className="md:hidden">
      <div className="flex items-center gap-1 overflow-x-auto py-1.5">
        <button
          type="button"
          className={barItem}
          aria-expanded={open}
          aria-controls="mobile-shop-menu"
          data-state={open ? 'open' : 'closed'}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Menu className="size-4" aria-hidden="true" />
          )}
          Shop
        </button>
        {BAR_LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn(barItem, 'shrink-0')}>
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>

      {open ? (
        <div
          id="mobile-shop-menu"
          onClick={closeOnLink}
          className="max-h-[70vh] space-y-1 overflow-y-auto border-t py-3"
        >
          {categories.map((branch) =>
            branch.children.length > 0 ? (
              <details key={branch.category.id} className="group">
                <summary
                  className={cn(
                    panelLink,
                    'flex cursor-pointer list-none items-center justify-between font-medium',
                  )}
                >
                  {branch.category.name}
                  <ChevronDown
                    className="size-4 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <ul className="mb-2 ml-3 border-l pl-2">
                  <li>
                    <Link
                      href={categoryHref(branch.category.slug)}
                      className={panelLink}
                    >
                      All {branch.category.name}
                    </Link>
                  </li>
                  {branch.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={categoryHref(child.slug)}
                        className={panelLink}
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <Link
                key={branch.category.id}
                href={categoryHref(branch.category.slug)}
                className={cn(panelLink, 'font-medium')}
              >
                {branch.category.name}
              </Link>
            ),
          )}

          {brands.length > 0 ? (
            <details className="group">
              <summary
                className={cn(
                  panelLink,
                  'flex cursor-pointer list-none items-center justify-between font-medium',
                )}
              >
                Brands
                <ChevronDown
                  className="size-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <ul className="mb-2 ml-3 grid grid-cols-2 border-l pl-2">
                {brands.flatMap((group) =>
                  group.brands.map((brand) => (
                    <li key={brand.id}>
                      <Link href={brandHref(brand.slug)} className={panelLink}>
                        {brand.name}
                      </Link>
                    </li>
                  )),
                )}
              </ul>
            </details>
          ) : null}

          {stores.length > 0 ? (
            <details className="group">
              <summary
                className={cn(
                  panelLink,
                  'flex cursor-pointer list-none items-center justify-between font-medium',
                )}
              >
                Stores
                <ChevronDown
                  className="size-4 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <ul className="mb-2 ml-3 border-l pl-2">
                {stores.slice(0, STORE_PANEL_LIMIT).map((store) => (
                  <li key={store.id}>
                    <Link
                      href={`/sellers/${store.storefrontSlug}`}
                      className={panelLink}
                    >
                      {storeName(store)}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/stores" className={cn(panelLink, 'font-medium')}>
                    All stores
                  </Link>
                </li>
              </ul>
            </details>
          ) : null}

          <ul className="mt-2 grid grid-cols-2 border-t pt-2">
            {QUICK_LINKS.slice(3).map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(panelLink, 'flex items-center gap-2')}
                >
                  <Icon
                    className="text-muted-foreground size-4"
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
