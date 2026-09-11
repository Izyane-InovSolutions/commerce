import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { CheckoutContent } from '@/components/checkout-content';
import { Button } from '@/components/ui/button';
import { describeOffers, getCart } from '@/lib/cart';
import { listAddresses } from '@/lib/orders';
import { getCurrentUser } from '@/lib/session';

import { createAddressAction, placeOrderAction } from './actions';

export const metadata: Metadata = {
  title: 'Checkout',
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();

  // Checkout is the one storefront flow the API will not serve a guest: an
  // order belongs to an account, and so does the address it ships to.
  if (!user) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Sign in to check out. Your cart comes with you.
        </p>
        <Button asChild size="sm">
          <Link href="/account">Sign in</Link>
        </Button>
      </div>
    );
  }

  let cart;
  let offers;
  let addresses;

  try {
    [cart, addresses] = await Promise.all([getCart(), listAddresses()]);
    offers = await describeOffers(cart.items.map((line) => line.offerId));
  } catch (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <p className="text-muted-foreground mt-1 text-sm text-pretty">
        Prices and stock are confirmed by the Commerce API as the order is
        placed, not from what this page last saw.
      </p>

      <div className="mt-8">
        <CheckoutContent
          cart={cart}
          offers={offers}
          addresses={addresses}
          placeOrder={placeOrderAction}
          createAddress={createAddressAction}
        />
      </div>
    </div>
  );
}
