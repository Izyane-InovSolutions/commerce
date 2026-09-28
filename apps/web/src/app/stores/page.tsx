import type { Metadata } from 'next';
import Link from 'next/link';
import { Star, Store } from 'lucide-react';

import { listStorefronts } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Stores' };

/**
 * Every marketplace store with a public page, busiest first. Buying from a
 * store's own page is the same checkout as anywhere else.
 */
export default async function StoresPage() {
  const stores = (await listStorefronts().catch(() => []))
    .filter((store) => store.storefrontSlug)
    .sort(
      (left, right) =>
        right.listingCount - left.listingCount ||
        (left.displayName ?? '').localeCompare(right.displayName ?? ''),
    );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Stores</h1>
        <p className="text-muted-foreground text-sm">
          Independent sellers on iZyane. Open a store to see everything it sells
          and what its buyers say.
        </p>
      </div>

      {stores.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm">
          No stores are open yet. Everything in the catalog is sold by iZyane
          directly for now.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <li key={store.id}>
              <Link
                href={`/sellers/${store.storefrontSlug}`}
                className="hover:border-foreground/25 flex h-full gap-3 rounded-xl border p-4 transition-colors"
              >
                <span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-lg">
                  <Store
                    className="text-muted-foreground size-5"
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 space-y-1">
                  <span className="block font-semibold">
                    {store.displayName ?? 'Marketplace store'}
                  </span>
                  {store.description ? (
                    <span className="text-muted-foreground line-clamp-2 block text-sm">
                      {store.description}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    {store.ratingCount > 0 && store.averageRating ? (
                      <>
                        <Star className="size-3" aria-hidden="true" />
                        {store.averageRating.toFixed(1)} from{' '}
                        {store.ratingCount}{' '}
                        {store.ratingCount === 1 ? 'rating' : 'ratings'} ·{' '}
                      </>
                    ) : null}
                    {store.listingCount}{' '}
                    {store.listingCount === 1 ? 'product' : 'products'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
