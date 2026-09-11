import { Suspense } from 'react';
import Link from 'next/link';

import { getAdminInsights } from '@commerce/api-client';

import { ApiStatusCard } from '@/components/api-status-card';
import { BuyabilityChart } from '@/components/charts/buyability-chart';
import { ContributionChart } from '@/components/charts/contribution-chart';
import { OfferDepthChart } from '@/components/charts/offer-depth-chart';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

const SECTIONS = [
  {
    href: '/catalog',
    label: 'Catalog',
    description: 'Products, variants, and the moderation queue.',
  },
  {
    href: '/categories',
    label: 'Categories',
    description: 'The shared category tree.',
  },
  { href: '/brands', label: 'Brands', description: 'The shared brand list.' },
  {
    href: '/sellers',
    label: 'Sellers',
    description: 'Applications, approval, and suspension.',
  },
  {
    href: '/inventory',
    label: 'Inventory',
    description: 'Stock across platform and seller locations.',
  },
  {
    href: '/orders',
    label: 'Orders',
    description: 'Customer orders and their seller breakdown.',
  },
  {
    href: '/payments',
    label: 'Payments',
    description: 'Payments, refunds, and reconciliation.',
  },
  {
    href: '/finance',
    label: 'Finance',
    description: 'Ledger, commissions, balances, and payouts.',
  },
  {
    href: '/audit',
    label: 'Audit',
    description: 'Events raised by privileged actions.',
  },
];

/**
 * What needs attention, and what the marketplace looks like.
 *
 * Every figure is derived from catalog, offer and stock state. Nothing is
 * trend-shaped because there is no time dimension in the data yet — a
 * sales-over-time chart here would be decoration, not information.
 */
async function AdminInsights() {
  let insights;
  try {
    insights = await getAdminInsights(apiClient);
  } catch {
    // The status card below already reports an unreachable API.
    return null;
  }

  const { queue, totals } = insights;
  const waiting = [
    {
      href: '/sellers',
      label: 'Applications waiting',
      value: queue.applicationsPending,
      urgent: queue.applicationsPending > 0,
    },
    {
      href: '/catalog?status=pending',
      label: 'Products waiting for review',
      value: queue.productsPending,
      urgent: queue.productsPending > 0,
    },
    {
      href: '/sellers',
      label: 'Active sellers',
      value: totals.activeSellers,
      urgent: false,
    },
    {
      href: '/sellers?status=suspended',
      label: 'Suspended sellers',
      value: totals.suspendedSellers,
      urgent: totals.suspendedSellers > 0,
    },
    {
      href: '/catalog?status=active',
      label: 'Products on sale',
      value: totals.productsOnSale,
      urgent: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {waiting.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="hover:border-foreground/25 rounded-xl border p-4 transition-colors"
          >
            <p
              className={
                item.urgent
                  ? 'text-destructive text-2xl font-semibold'
                  : 'text-2xl font-semibold'
              }
            >
              {item.value}
            </p>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              {item.label}
            </p>
          </Link>
        ))}
      </div>

      <BuyabilityChart buyability={insights.buyability} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ContributionChart contribution={insights.contribution} />
        <OfferDepthChart offerDepth={insights.offerDepth} />
      </div>
    </div>
  );
}

export default async function OverviewPage() {
  await requireAdmin();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Admin portal"
        description="Administrative control over the catalog, sellers, orders, payments, and finance. Authorization is enforced by the Commerce API; this portal only decides what to show."
      />

      <Suspense fallback={null}>
        <AdminInsights />
      </Suspense>

      <Suspense fallback={null}>
        <ApiStatusCard />
      </Suspense>

      <section className="space-y-4">
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
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {section.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
