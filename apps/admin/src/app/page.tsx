import { Suspense } from 'react';
import Link from 'next/link';

import { ApiStatusCard } from '@/components/api-status-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const sections = [
  {
    href: '/catalog',
    label: 'Catalog',
    description:
      'Products, variants, categories, brands, and media. Products are owned by the platform, never by a seller.',
  },
  {
    href: '/sellers',
    label: 'Sellers',
    description: 'Seller applications, verification, approval, and suspension.',
  },
  {
    href: '/orders',
    label: 'Orders',
    description:
      'Customer orders, the seller orders beneath them, and their fulfillment groups.',
  },
  {
    href: '/payments',
    label: 'Payments',
    description:
      'Payments, refunds, and reconciliation against the in-house gateway. Payment state is only ever trusted after server-side verification.',
  },
  {
    href: '/inventory',
    label: 'Inventory',
    description:
      'On-hand, reserved, available, damaged, and in-transit stock by location.',
  },
  {
    href: '/fulfillment',
    label: 'Fulfillment',
    description: 'Shipments, carrier handoffs, 3PL integrations, and pickup.',
  },
  {
    href: '/promotions',
    label: 'Promotions',
    description: 'Campaigns, coupons, and curated collections.',
  },
  {
    href: '/moderation',
    label: 'Moderation',
    description: 'Review moderation and reported content.',
  },
  {
    href: '/support',
    label: 'Support',
    description:
      'Customer and seller support cases, including returns and disputes.',
  },
  {
    href: '/finance',
    label: 'Finance',
    description:
      'Ledger entries, commissions, seller balances, and payouts. Balances are derived from auditable financial events.',
  },
  {
    href: '/analytics',
    label: 'Analytics',
    description: 'Trading, catalog, and marketplace reporting.',
  },
  {
    href: '/security',
    label: 'Security',
    description: 'Roles, permissions, and access controls.',
  },
  {
    href: '/audit',
    label: 'Audit',
    description: 'Audit events raised by privileged actions.',
  },
];

export default function OverviewPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Admin portal</h1>
        <p className="text-muted-foreground max-w-2xl text-pretty">
          Administrative control over the catalog, sellers, orders, payments,
          and finance. Authorization is enforced by the Commerce API; this
          portal only decides what to show.
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
