import Link from 'next/link';
import { Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  FIRST_PARTY_STORE_NAME,
  type ProductOffer,
  type Storefront,
} from '@/lib/catalog-types';

/**
 * Who is selling the variant on screen: a marketplace store (with its
 * rating and a way into its storefront) or the platform itself. Every
 * product page says so, so a shopper never has to guess who they're
 * buying from.
 */
export function StoreCard({
  offer,
  storefront,
}: {
  offer: ProductOffer | null;
  /** The store's public detail, when it's a marketplace offer. */
  storefront: Storefront | null;
}) {
  if (!offer) return null;
  const seller = offer.seller ?? null;
  const name = seller
    ? (seller.displayName ?? 'A marketplace store')
    : FIRST_PARTY_STORE_NAME;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
      <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Store className="text-muted-foreground size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {seller ? 'Sold by ' : 'Sold and shipped by '}
          <span className="font-semibold">{name}</span>
        </p>
        <p className="text-muted-foreground text-xs">
          {seller
            ? storefront &&
              storefront.ratingCount > 0 &&
              storefront.averageRating
              ? `Rated ${storefront.averageRating.toFixed(1)} out of 5 by ${storefront.ratingCount} ${
                  storefront.ratingCount === 1 ? 'buyer' : 'buyers'
                }`
              : 'A marketplace store on iZyane'
            : 'Sold directly by the iZyane marketplace'}
        </p>
      </div>
      {seller?.storefrontSlug ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/sellers/${seller.storefrontSlug}`}>Visit store</Link>
        </Button>
      ) : null}
    </div>
  );
}
