import type { Metadata } from 'next';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { CartContents } from '@/components/cart-contents';
import { CartMergeNotice } from '@/components/cart-merge-notice';
import { getCart, labelOffers } from '@/lib/cart';
import { hasCartMergeFailed } from '@/lib/cart-merge-notice';
import { getCurrentUser } from '@/lib/session';

import {
  dismissCartMergeNoticeAction,
  retryCartMergeAction,
} from './actions';

export const metadata: Metadata = {
  title: 'Cart',
};

export default async function CartPage() {
  let cart;
  let labels;
  let mergeFailed = false;

  try {
    cart = await getCart();
    labels = await labelOffers(cart.items.map((line) => line.offerId));
    // Only meaningful while signed in: the merge it is about folds a guest
    // cart into an account.
    mergeFailed = (await hasCartMergeFailed()) && (await getCurrentUser()) !== null;
  } catch (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
      {mergeFailed ? (
        <CartMergeNotice
          retry={retryCartMergeAction}
          dismiss={dismissCartMergeNoticeAction}
        />
      ) : null}
      <CartContents cart={cart} labels={Object.fromEntries(labels)} />
    </div>
  );
}
