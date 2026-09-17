import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { Button } from '@/components/ui/button';
import { WishlistList } from '@/components/wishlist-list';
import { labelOffers } from '@/lib/cart';
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
  let labels;
  try {
    items = await listWishlist();
    labels = await labelOffers(items.map((item) => item.offerId));
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

      <WishlistList
        items={items}
        labels={labels}
        addToCart={addWishlistItemToCartAction}
        remove={removeFromWishlistAction}
      />
    </div>
  );
}
