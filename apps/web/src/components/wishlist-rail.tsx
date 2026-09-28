import Link from 'next/link';

import { ShelfHeading } from '@/components/product-rail';
import { ProductImage } from '@/components/product-image';
import type { OfferLabel } from '@/lib/cart';
import type { WishlistItemView } from '@/lib/commerce-types';
import { formatMinor } from '@/lib/currency';

/**
 * A signed-in shopper's saved items on the homepage, at today's price.
 * Renders nothing for an empty wishlist.
 */
export function WishlistRail({
  items,
  labels,
}: {
  items: WishlistItemView[];
  labels: Map<string, OfferLabel>;
}) {
  const shown = items.slice(0, 8);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="wishlist-heading" className="space-y-4">
      <ShelfHeading
        id="wishlist-heading"
        title="From your wishlist"
        description="Saved by you, at today's prices."
        href="/account?tab=wishlist"
        linkLabel={
          items.length > shown.length
            ? `See all ${items.length}`
            : 'Open wishlist'
        }
      />
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-8 lg:overflow-visible lg:px-0 lg:pb-0">
        {shown.map((item) => {
          const label = labels.get(item.offerId);
          const body = (
            <>
              <ProductImage
                src={label?.imageUrl ?? null}
                alt={label?.name ?? 'Saved item'}
                sizes="8rem"
                className="aspect-square rounded-lg"
                iconClassName="size-6"
              />
              <p className="line-clamp-2 text-xs font-medium group-hover:underline">
                {label?.name ?? 'Saved item'}
              </p>
              <p className="text-muted-foreground text-xs">
                {!item.isAvailable
                  ? 'No longer available'
                  : item.currentPrice
                    ? formatMinor(
                        item.currentPrice.amount,
                        item.currentPrice.currency,
                      )
                    : 'Not priced right now'}
              </p>
            </>
          );
          return (
            <li key={item.id} className="w-32 shrink-0 snap-start lg:w-auto">
              {label?.slug ? (
                <Link
                  href={`/products/${label.slug}`}
                  className="group block space-y-1.5"
                >
                  {body}
                </Link>
              ) : (
                <div className="space-y-1.5 opacity-70">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
