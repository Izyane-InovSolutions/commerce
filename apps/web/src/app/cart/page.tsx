import type { Metadata } from 'next';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { CartContents } from '@/components/cart-contents';
import { describeOffers, getCart } from '@/lib/cart';

export const metadata: Metadata = {
  title: 'Cart',
};

export default async function CartPage() {
  let cart;
  let offers;

  try {
    cart = await getCart();
    offers = await describeOffers(cart.items.map((line) => line.offerId));
  } catch (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
      <CartContents cart={cart} offers={offers} />
    </div>
  );
}
