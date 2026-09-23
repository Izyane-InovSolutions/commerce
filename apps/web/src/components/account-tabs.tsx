'use client';

import type { ReactNode } from 'react';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

/**
 * The tab shell for the signed-in account page.
 *
 * Each panel is handed in already rendered — the account page fetches
 * everything server-side (orders, wishlist, addresses) and passes the
 * finished JSX through as children, so this component only ever needs to be
 * a client component for the tab-switching itself.
 */
export type AccountTabValue =
  | 'recently-viewed'
  | 'wishlist'
  | 'saved-sellers'
  | 'orders'
  | 'addresses';

export function AccountTabs({
  recentlyViewed,
  wishlist,
  savedSellers,
  orders,
  addresses,
  defaultTab = 'recently-viewed',
}: {
  recentlyViewed: ReactNode;
  wishlist: ReactNode;
  savedSellers: ReactNode;
  orders: ReactNode;
  addresses: ReactNode;
  /** Which tab opens first — set from `?tab=` when linked in from elsewhere. */
  defaultTab?: AccountTabValue;
}) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="recently-viewed">Recently viewed</TabsTrigger>
        <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
        <TabsTrigger value="saved-sellers">Saved sellers</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="addresses">My addresses</TabsTrigger>
      </TabsList>
      <TabsContent value="recently-viewed">{recentlyViewed}</TabsContent>
      <TabsContent value="wishlist">{wishlist}</TabsContent>
      <TabsContent value="saved-sellers">{savedSellers}</TabsContent>
      <TabsContent value="orders">{orders}</TabsContent>
      <TabsContent value="addresses">{addresses}</TabsContent>
    </Tabs>
  );
}
