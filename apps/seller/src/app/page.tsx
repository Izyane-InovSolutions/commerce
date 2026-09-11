import { Suspense } from 'react';
import Link from 'next/link';

import { ApiStatusCard } from '@/components/api-status-card';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { navigation } from '@/lib/navigation';
import { requireUser } from '@/lib/session';

/**
 * The seller portal signed in against the real API.
 *
 * Authentication is live; nothing else can be, because the Commerce API has
 * no seller domain yet. Saying so plainly beats showing empty tables that
 * would read as "you have nothing" rather than "this does not exist".
 */
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description="Signed in against the Commerce API."
      />

      <Card className="border-primary/40 max-w-2xl">
        <CardHeader>
          <CardTitle>Selling is not available in the API yet</CardTitle>
          <CardDescription>
            You are signed in as{' '}
            <span className="font-medium">{user.email}</span> with the{' '}
            <code className="font-mono">{user.role}</code> role.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-3 text-sm">
          <p className="text-pretty">
            The Commerce API covers authentication, the catalog, inventory,
            cart, and orders — all of it platform-owned. There is a{' '}
            <code className="font-mono">SELLER</code> role and a nullable{' '}
            <code className="font-mono">Offer.sellerId</code>, but no seller
            table and no seller-scoped endpoints; the schema notes that sellers
            arrive in Phase 3.
          </p>
          <p className="text-pretty">
            Every section below is built and wired. Each one names the endpoints
            it is waiting for.
          </p>
        </CardContent>
      </Card>

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
                  <span className="text-muted-foreground text-xs italic">
                    awaiting API
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
