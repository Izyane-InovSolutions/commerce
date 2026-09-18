import type { Metadata } from 'next';

import { AccountTabs, type AccountTabValue } from '@/components/account-tabs';
import { AddressesSection } from '@/components/addresses-section';
import { ApiErrorNotice } from '@/components/api-error-notice';
import { OrderStatusPoller } from '@/components/order-status-poller';
import { OrdersList } from '@/components/orders-list';
import { RecentlyViewedSection } from '@/components/recently-viewed-section';
import { SignInForm } from '@/components/sign-in-form';
import { SignUpForm } from '@/components/sign-up-form';
import { WishlistList } from '@/components/wishlist-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { labelOffers } from '@/lib/cart';
import { listAddresses, listOrders, reconcileOrderPayments } from '@/lib/orders';
import { getCurrentUser } from '@/lib/session';
import { listWishlist } from '@/lib/wishlist';

import {
  addAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  signInAction,
  signOutAction,
  signUpAction,
  updateAddressAction,
} from './actions';
import {
  addWishlistItemToCartAction,
  removeFromWishlistAction,
} from '../wishlist/actions';

export const metadata: Metadata = {
  title: 'Account',
};

const TAB_VALUES: AccountTabValue[] = [
  'recently-viewed',
  'wishlist',
  'orders',
  'addresses',
];

function readTab(value: string | string[] | undefined): AccountTabValue {
  const candidate = Array.isArray(value) ? value[0] : value;
  return TAB_VALUES.includes(candidate as AccountTabValue)
    ? (candidate as AccountTabValue)
    : 'recently-viewed';
}

export default async function AccountPage({
  searchParams,
}: PageProps<'/account'>) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-12 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              One account for customers, sellers, and admins — sign in here
              either way.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignInForm action={signInAction} next="/account" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create an account</CardTitle>
            <CardDescription>
              New accounts start as a customer. Selling and admin access are
              granted separately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignUpForm action={signUpAction} next="/account" />
          </CardContent>
        </Card>
      </div>
    );
  }

  let orders;
  let wishlistItems;
  let addresses;
  let labels;

  try {
    [orders, wishlistItems, addresses] = await Promise.all([
      listOrders(),
      listWishlist(),
      listAddresses(),
    ]);

    // Same reconciliation the standalone orders page does: a mobile money
    // charge the customer already approved settles at the gateway within
    // seconds, and nothing pushes that back to us on its own.
    if (await reconcileOrderPayments(orders)) {
      orders = await listOrders();
    }

    labels = await labelOffers([
      ...orders.flatMap((order) => order.items.map((item) => item.offerId)),
      ...wishlistItems.map((item) => item.offerId),
    ]);
  } catch (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const awaitingPayment = orders.some(
    (order) => order.status === 'PENDING_PAYMENT',
  );

  const params = await searchParams;
  const defaultTab = readTab(params.tab);
  const justPlaced =
    typeof params.placed === 'string' ? params.placed : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {user.email}
            <Badge variant="secondary">{user.role}</Badge>
          </CardTitle>
          <CardDescription>You&apos;re signed in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>

      <AccountTabs
        defaultTab={defaultTab}
        recentlyViewed={<RecentlyViewedSection />}
        wishlist={
          <WishlistList
            items={wishlistItems}
            labels={labels}
            addToCart={addWishlistItemToCartAction}
            remove={removeFromWishlistAction}
          />
        }
        orders={
          <div className="space-y-4">
            {awaitingPayment ? <OrderStatusPoller /> : null}
            {justPlaced ? (
              <div
                role="status"
                className="rounded-2xl border border-dashed px-4 py-3 text-sm"
              >
                <p className="font-medium">Order placed</p>
                <p className="text-muted-foreground text-pretty">
                  It is the first one below, under reference{' '}
                  <span className="font-mono">{justPlaced.slice(0, 8)}</span>.
                  Your payment status will update automatically.
                </p>
              </div>
            ) : null}
            <OrdersList orders={orders} labels={labels} />
          </div>
        }
        addresses={
          <AddressesSection
            addresses={addresses}
            addAddress={addAddressAction}
            updateAddress={updateAddressAction}
            removeAddress={deleteAddressAction}
            setDefaultAddress={setDefaultAddressAction}
          />
        }
      />
    </div>
  );
}
