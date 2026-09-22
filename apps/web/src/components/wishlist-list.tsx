import Link from 'next/link';

import { ProductImage } from '@/components/product-image';
import { WishlistItemActions } from '@/components/wishlist-item-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { OfferLabel } from '@/lib/cart';
import { formatMinor } from '@/lib/currency';
import type { FormState } from '@/lib/form';
import type { WishlistItemView } from '@/lib/commerce-types';

/** Shared by the standalone wishlist page and the account page's Wishlist tab. */
export function WishlistList({
  items,
  labels,
  addToCart,
  remove,
}: {
  items: WishlistItemView[];
  labels: Map<string, OfferLabel>;
  addToCart: (offerId: string) => Promise<FormState>;
  remove: (offerId: string) => Promise<FormState>;
}) {
  if (items.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Nothing saved yet</p>
        <p className="text-muted-foreground text-sm">
          Save products you are thinking about and they will wait here.
        </p>
        <Button asChild size="sm">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const label = labels.get(item.offerId);

        return (
          <li key={item.id}>
            <Card>
              <CardContent className="flex items-center gap-4">
                <ProductImage
                  src={label?.imageUrl ?? null}
                  alt={label?.name ?? 'Saved item'}
                  sizes="64px"
                  className="size-16 shrink-0 rounded-lg"
                  iconClassName="size-6"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {label?.name ?? 'Saved item'}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {item.currentPrice
                      ? formatMinor(
                          item.currentPrice.amount,
                          item.currentPrice.currency,
                        )
                      : 'No current price'}
                  </p>
                </div>
                <WishlistItemActions
                  available={item.isAvailable}
                  addToCart={addToCart.bind(null, item.offerId)}
                  remove={remove.bind(null, item.offerId)}
                />
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
