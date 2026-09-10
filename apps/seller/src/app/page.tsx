import { Suspense } from 'react';
import Link from 'next/link';

import { ApiStatusCard } from '@/components/api-status-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const sections = [
  {
    href: '/offers',
    label: 'Offers',
    description:
      'Your offers against catalog products, with pricing and commercial conditions. Prices are authoritative on the server.',
  },
  {
    href: '/inventory',
    label: 'Inventory',
    description:
      'Stock levels for the SKUs you sell, including reserved and available quantities.',
  },
  {
    href: '/orders',
    label: 'Orders',
    description:
      'Orders placed against your offers, as seller orders beneath the customer order.',
  },
  {
    href: '/fulfillment',
    label: 'Fulfillment',
    description:
      'Pick, pack, ship, and tracking updates for the orders you fulfill.',
  },
  {
    href: '/earnings',
    label: 'Earnings',
    description: 'Commission, fees, and your ledger-backed balance.',
  },
  {
    href: '/payouts',
    label: 'Payouts',
    description: 'Payout schedule, history, and settlement details.',
  },
  {
    href: '/reviews',
    label: 'Reviews',
    description: 'Reviews left for your offers and your storefront.',
  },
  {
    href: '/analytics',
    label: 'Analytics',
    description: 'Sales, conversion, and offer performance.',
  },
  {
    href: '/profile',
    label: 'Profile',
    description:
      'Storefront details, policies, and the users on your seller account.',
  },
];

export default function OverviewPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Seller portal</h1>
        <p className="text-muted-foreground max-w-2xl text-pretty">
          Manage your storefront on the Commerce marketplace. You own offers
          against the shared catalog — not the products themselves — and every
          request is scoped to your seller account.
        </p>
      </section>

      <Suspense fallback={null}>
        <ApiStatusCard />
      </Suspense>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Sections</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <Card
              key={section.href}
              className="relative hover:border-foreground/20"
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
