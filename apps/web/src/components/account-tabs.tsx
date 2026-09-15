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
export function AccountTabs({
  recentlyViewed,
  wishlist,
  orders,
  addresses,
}: {
  recentlyViewed: ReactNode;
  wishlist: ReactNode;
  orders: ReactNode;
  addresses: ReactNode;
}) {
  return (
    <Tabs defaultValue="recently-viewed">
      <TabsList>
        <TabsTrigger value="recently-viewed">Recently viewed</TabsTrigger>
        <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="addresses">My addresses</TabsTrigger>
      </TabsList>
      <TabsContent value="recently-viewed">{recentlyViewed}</TabsContent>
      <TabsContent value="wishlist">{wishlist}</TabsContent>
      <TabsContent value="orders">{orders}</TabsContent>
      <TabsContent value="addresses">{addresses}</TabsContent>
    </Tabs>
  );
}
