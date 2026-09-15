'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { ProductImage } from '@/components/product-image';
import { Button } from '@/components/ui/button';
import { formatMinor } from '@/lib/currency';
import {
  getRecentlyViewed,
  type RecentlyViewedEntry,
} from '@/lib/recently-viewed';

/**
 * What the visitor looked at, from their own browser's storage.
 *
 * Null until mounted, rather than an empty list from the start — reading
 * `localStorage` during server rendering would either be wrong (nothing to
 * read there) or force this whole tab client-only from the page level, so
 * instead it renders nothing for the one frame before the effect runs.
 */
export function RecentlyViewedSection() {
  const [items, setItems] = useState<RecentlyViewedEntry[] | null>(null);

  useEffect(() => {
    setItems(getRecentlyViewed());
  }, []);

  if (items === null) {
    return null;
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Nothing viewed yet</p>
        <p className="text-muted-foreground text-sm">
          Products you look at will show up here.
        </p>
        <Button asChild size="sm">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/products/${item.slug}`}
          className="group space-y-2"
        >
          <ProductImage
            src={item.imageUrl}
            alt={item.name}
            sizes="(min-width: 640px) 25vw, 50vw"
            className="aspect-square rounded-lg"
            iconClassName="size-8"
          />
          <div>
            <p className="truncate text-sm font-medium group-hover:underline">
              {item.name}
            </p>
            {item.price ? (
              <p className="text-muted-foreground text-sm">
                {formatMinor(item.price.amount, item.price.currency)}
              </p>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
