'use client';

import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';

import { ShelfHeading } from '@/components/product-rail';
import { ProductImage } from '@/components/product-image';
import { formatMinor } from '@/lib/currency';
import {
  parseRecentlyViewed,
  readRecentlyViewedSnapshot,
  subscribeRecentlyViewed,
} from '@/lib/recently-viewed';

/**
 * The homepage's "pick up where you left off" shelf, from this browser's
 * own history. Renders nothing on the server (the list lives in
 * localStorage) and nothing at all for a first-time visitor.
 */
export function RecentlyViewedRail() {
  // The server snapshot is empty: the list only exists in the browser.
  const raw = useSyncExternalStore(
    subscribeRecentlyViewed,
    readRecentlyViewedSnapshot,
    () => '',
  );
  const items = useMemo(() => parseRecentlyViewed(raw).slice(0, 8), [raw]);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="space-y-4">
      <ShelfHeading
        id="recent-heading"
        title="Pick up where you left off"
        description="Products you looked at recently, on this device."
        href="/account?tab=recently-viewed"
        linkLabel="See your history"
      />
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-8 lg:overflow-visible lg:px-0 lg:pb-0">
        {items.map((item) => (
          <li key={item.id} className="w-32 shrink-0 snap-start lg:w-auto">
            <Link
              href={`/products/${item.slug}`}
              className="group block space-y-1.5"
            >
              <ProductImage
                src={item.imageUrl}
                alt={item.name}
                sizes="8rem"
                className="aspect-square rounded-lg"
                iconClassName="size-6"
              />
              <p className="line-clamp-2 text-xs font-medium group-hover:underline">
                {item.name}
              </p>
              {item.price ? (
                <p className="text-muted-foreground text-xs">
                  {formatMinor(item.price.amount, item.price.currency)}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
