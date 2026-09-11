import { Suspense } from 'react';

import { ApiStatusCard } from '@/components/api-status-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const upcomingCapabilities = [
  {
    title: 'Catalog and search',
    description:
      'Browse categories, brands, and products backed by the catalog module.',
  },
  {
    title: 'Product and offers',
    description:
      'A product page listing every offer, from platform retail to third-party sellers.',
  },
  {
    title: 'Cart and checkout',
    description:
      'Server-authoritative pricing, totals snapshotted at checkout, and in-house payments.',
  },
  {
    title: 'Orders and account',
    description: 'Order history, tracking, returns, reviews, and addresses.',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-12">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Commerce Marketplace storefront
        </h1>
        <p className="text-muted-foreground max-w-2xl text-pretty">
          The customer web client for the Commerce Platform. It consumes the
          same versioned Commerce API as the mobile, seller, and admin clients.
        </p>
      </section>

      <Suspense fallback={null}>
        <ApiStatusCard />
      </Suspense>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Phase 1 scope</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {upcomingCapabilities.map((capability) => (
            <Card key={capability.title}>
              <CardHeader>
                <CardTitle>{capability.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {capability.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
