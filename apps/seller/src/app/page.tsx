import { Suspense } from 'react';
import Link from 'next/link';

import { getSellerInsights, listSellerCatalog } from '@commerce/api-client';
import type { SellerProductRow } from '@commerce/contracts';

import { ApiStatusCard } from '@/components/api-status-card';
import { PricePositionChart } from '@/components/charts/price-position-chart';
import { StockPositionChart } from '@/components/charts/stock-position-chart';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireUser } from '@/lib/session';

const SECTIONS = [
  {
    href: '/products',
    label: 'Products',
    description: 'What you sell, with your price and your stock.',
  },
  {
    href: '/orders',
    label: 'Orders',
    description: 'Orders placed against your offers.',
  },
  {
    href: '/inventory',
    label: 'Inventory',
    description: 'The stock you hold, and what is running low.',
  },
  {
    href: '/customers',
    label: 'Customers',
    description: 'People who have bought from you.',
  },
  {
    href: '/promotions',
    label: 'Promotions',
    description: 'Your own discounts and campaigns.',
  },
  {
    href: '/payments',
    label: 'Payments',
    description: 'Your balance, commission, and payouts.',
  },
  {
    href: '/analytics',
    label: 'Analytics',
    description: 'Sales, conversion, and offer performance.',
  },
  {
    href: '/settings',
    label: 'Store Settings',
    description: 'Storefront details, policies, and account users.',
  },
];

/** What the seller most likely needs to act on, counted from their catalog. */
function summarise(rows: SellerProductRow[]): {
  href: string;
  label: string;
  count: number;
  urgent: boolean;
}[] {
  const onSale = rows.filter(
    (row) => row.productStatus === 'active' && row.offerStatus === 'active',
  );

  return [
    {
      href: '/products?view=rejected',
      label: 'Rejected, needs a fix',
      count: rows.filter((row) => row.productStatus === 'rejected').length,
      urgent: true,
    },
    {
      href: '/products?view=draft',
      label: 'Drafts not yet submitted',
      count: rows.filter((row) => row.productStatus === 'draft').length,
      urgent: false,
    },
    {
      href: '/products?view=pending',
      label: 'Awaiting approval',
      count: rows.filter((row) => row.productStatus === 'pending').length,
      urgent: false,
    },
    {
      href: '/products',
      label: 'Priced but out of stock',
      count: rows.filter(
        (row) => row.offerId !== null && (row.available ?? 0) <= 0,
      ).length,
      urgent: true,
    },
    {
      href: '/products?view=active',
      label: 'On sale now',
      count: onSale.filter((row) => (row.available ?? 0) > 0).length,
      urgent: false,
    },
  ];
}

async function SellerSummary() {
  let rows: SellerProductRow[];
  try {
    rows = (await listSellerCatalog(apiClient, { pageSize: 200 })).items;
  } catch {
    // The status card below already reports an unreachable API.
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {summarise(rows).map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="hover:border-foreground/25 rounded-xl border p-4 transition-colors"
        >
          <p
            className={
              item.urgent && item.count > 0
                ? 'text-destructive text-2xl font-semibold tabular-nums'
                : 'text-2xl font-semibold tabular-nums'
            }
          >
            {item.count}
          </p>
          <p className="text-muted-foreground mt-1 text-sm text-pretty">
            {item.label}
          </p>
        </Link>
      ))}
    </div>
  );
}

/**
 * The two things a seller can act on today.
 *
 * Both are composition and comparison, not trends: there is no orders domain
 * yet, so a sales line would be invented rather than measured.
 */
async function SellerCharts() {
  let insights;
  try {
    insights = await getSellerInsights(apiClient);
  } catch {
    // The status card below already reports an unreachable API.
    return null;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <StockPositionChart stock={insights.stock} />
      <PricePositionChart prices={insights.prices} />
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const canTrade = Boolean(user.sellerId) && user.roles.includes('seller');

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description="Your storefront on the Commerce marketplace. You own the price and the stock; the platform owns the product record."
      />

      {canTrade ? (
        <Suspense fallback={null}>
          <SellerSummary />
        </Suspense>
      ) : (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>You do not have a store yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground text-pretty">
              Apply for a store to start listing products. An administrator
              reviews every application before you can sell.
            </p>
            <Button asChild>
              <Link href="/apply">Apply to sell</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {canTrade ? (
        <Suspense fallback={null}>
          <SellerCharts />
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
        <ApiStatusCard />
      </Suspense>

      <section className={canTrade ? 'space-y-4' : 'hidden'}>
        <h2 className="text-lg font-semibold tracking-tight">Sections</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map((section) => (
            <Card
              key={section.href}
              className="hover:border-foreground/20 relative"
            >
              <CardHeader>
                <CardTitle>
                  <Link
                    href={section.href}
                    className="after:absolute after:inset-0"
                  >
                    {section.label}
                  </Link>
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
