import { Suspense } from 'react';
import Link from 'next/link';

import {
  backendGetOwnBalance,
  backendListSellerOffers,
  backendListSellerOrders,
} from '@commerce/api-client';

import { ApiStatusCard } from '@/components/api-status-card';
import { PageHeader } from '@/components/page-header';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { navigation } from '@/lib/navigation';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

/** Sections the Commerce API still has no endpoints for. */
const AWAITING_API = new Set([
  '/inventory',
  '/customers',
  '/promotions',
  '/analytics',
]);

export default async function DashboardPage() {
  const user = await requireUser();
  const account = await getSellerAccount();

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice
        title="Dashboard"
        description={`Signed in as ${user.email}.`}
        account={account}
      />
    );
  }

  // Each read stands on its own: a figure that cannot be fetched is shown as
  // unavailable rather than taking the whole dashboard down with it.
  const [balance, offers, orders] = await Promise.all([
    backendGetOwnBalance(apiClient).catch(() => null),
    backendListSellerOffers(apiClient, { limit: 1 }).catch(() => null),
    backendListSellerOrders(apiClient, { limit: 1 }).catch(() => null),
  ]);

  const figures = [
    {
      label: 'Balance',
      value: balance
        ? formatMinor(balance.balance, balance.currency)
        : 'Unavailable',
      href: '/payments',
      hint: 'Owed to you after commission and payouts.',
    },
    {
      label: 'Listings',
      value: offers ? String(offers.total) : 'Unavailable',
      href: '/products',
      hint: 'Everything you sell, published or not.',
    },
    {
      label: 'Orders',
      value: orders ? String(orders.total) : 'Unavailable',
      href: '/orders',
      hint: 'Your share of every customer order.',
    },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title={account.seller.displayName ?? account.seller.businessName}
        description={`Signed in as ${user.email}.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {figures.map((figure) => (
          <Link key={figure.label} href={figure.href} className="group">
            <Card className="group-hover:border-foreground/25 h-full transition-colors">
              <CardHeader>
                <CardDescription>{figure.label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {figure.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm text-pretty">
                {figure.hint}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Suspense fallback={null}>
        <ApiStatusCard />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Sections</h2>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {navigation
            .filter((item) => item.href !== '/')
            .map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="hover:border-foreground/25 flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors"
                >
                  {item.label}
                  {AWAITING_API.has(item.href) ? (
                    <span className="text-muted-foreground text-xs italic">
                      awaiting API
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
