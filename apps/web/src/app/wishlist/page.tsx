import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { WishlistItemActions } from '@/components/wishlist-item-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { describeOffers } from '@/lib/cart';
import { formatMinor } from '@/lib/currency';
import { getCurrentUser } from '@/lib/session';
import { listWishlist } from '@/lib/wishlist';

import {
  addWishlistItemToCartAction,
  removeFromWishlistAction,
} from './actions';

export const metadata: Metadata = {
  title: 'Wishlist',
};

export default async function WishlistPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Wishlist</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Sign in to save products for later. A wishlist belongs to an account,
          so there is no guest version of it.
        </p>
        <Button asChild size="sm">
          <Link href="/account">Sign in</Link>
        </Button>
      </div>
    );
  }

  let items;
  let offers;
  try {
    items = await listWishlist();
    offers = await describeOffers(items.map((item) => item.offerId));
  } catch (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Wishlist</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Wishlist</h1>

      {items.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
          <p className="font-medium">Nothing saved yet</p>
          <p className="text-muted-foreground text-sm">
            Save products you are thinking about and they will wait here.
          </p>
          <Button asChild size="sm">
            <Link href="/products">Browse products</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const offer = offers.get(item.offerId);

            return (
              <li key={item.id}>
                <Card>
                  <CardContent className="flex items-center gap-4">
                    <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-lg">
                      <PackageSearch
                        className="text-muted-foreground size-6"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {offer?.listingTitle ?? 'Saved item'}
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
                      addToCart={addWishlistItemToCartAction.bind(
                        null,
                        item.offerId,
                      )}
                      remove={removeFromWishlistAction.bind(null, item.offerId)}
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
