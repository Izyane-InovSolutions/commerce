import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, RotateCcw } from 'lucide-react';

import { AccountSettings } from '@/components/account-settings';
import { AccountTabs, type AccountTabValue } from '@/components/account-tabs';
import { AddressesSection } from '@/components/addresses-section';
import { ApiErrorNotice } from '@/components/api-error-notice';
import { AuthPanel } from '@/components/auth-panel';
import { OrderStatusPoller } from '@/components/order-status-poller';
import { OrdersList } from '@/components/orders-list';
import { RecentlyViewedSection } from '@/components/recently-viewed-section';
import { SavedSellersList } from '@/components/saved-sellers-list';
import { SellerAccountCard } from '@/components/seller-account-card';
import { WishlistList } from '@/components/wishlist-list';
import { Button } from '@/components/ui/button';
import { labelOffers } from '@/lib/cart';
import { listAddresses, listOrders, reconcileOrderPayments } from '@/lib/orders';
import { getProfile } from '@/lib/profile';
import { listSavedSellers } from '@/lib/saved-sellers';
import { getCurrentUser } from '@/lib/session';
import { getOwnSeller } from '@/lib/sellers';
import { listWishlist } from '@/lib/wishlist';

import {
  addAddressAction,
  becomeSellerAction,
  changePasswordAction,
  deleteAddressAction,
  goToSellerDashboardAction,
  setDefaultAddressAction,
  signInAction,
  signUpAction,
  updateAddressAction,
  updateProfileAction,
} from './actions';
import {
  addWishlistItemToCartAction,
  removeFromWishlistAction,
} from '../wishlist/actions';
import { unsaveSellerAction } from '../sellers/actions';

export const metadata: Metadata = {
  title: 'Account',
};

const TAB_VALUES: AccountTabValue[] = [
  'recently-viewed',
  'wishlist',
  'saved-sellers',
  'orders',
  'addresses',
  'settings',
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
  const params = await searchParams;

  if (!user) {
    return (
      <div>
        <AuthPanel
          signIn={signInAction}
          signUp={signUpAction}
          next="/account"
          notice={
            params.reset === 'done'
              ? 'Your password has been reset. Sign in with the new one.'
              : undefined
          }
        />
      </div>
    );
  }

  let orders;
  let wishlistItems;
  let savedSellers;
  let addresses;
  let labels;
  let seller;
  let profile;

  try {
    [orders, wishlistItems, savedSellers, addresses, seller, profile] =
      await Promise.all([
        listOrders(),
        listWishlist(),
        listSavedSellers(),
        listAddresses(),
        getOwnSeller(),
        getProfile(),
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
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const awaitingPayment = orders.some(
    (order) => order.status === 'PENDING_PAYMENT',
  );

  const defaultTab = readTab(params.tab);
  const justPlaced =
    typeof params.placed === 'string' ? params.placed : undefined;

  return (
    <div className="space-y-6">
      <SellerAccountCard
        seller={seller}
        becomeSeller={becomeSellerAction}
        goToDashboard={goToSellerDashboardAction}
      />

      <nav aria-label="Account shortcuts" className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/returns">
            <RotateCcw data-icon="inline-start" />
            Returns
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/notifications">
            <Bell data-icon="inline-start" />
            Notifications
          </Link>
        </Button>
      </nav>

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
        savedSellers={
          <SavedSellersList
            sellers={savedSellers}
            remove={unsaveSellerAction}
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
        settings={
          <AccountSettings
            profile={profile}
            updateProfile={updateProfileAction}
            changePassword={changePasswordAction}
          />
        }
      />
    </div>
  );
}
