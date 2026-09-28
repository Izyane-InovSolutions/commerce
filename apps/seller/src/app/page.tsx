import { Suspense } from 'react';
import Link from 'next/link';

import {
  backendGetOwnBalance,
  backendGetSellerAttention,
  backendGetSellerSalesAnalytics,
  backendListSellerOffers,
  backendListSellerOrders,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { ApiStatusCard } from '@/components/api-status-card';
import { AttentionList } from '@/components/attention-list';
import { LowStockList } from '@/components/low-stock-list';
import { StatTile } from '@/components/stat-tile';
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
import { explainMissingRoute } from '@/lib/api-route-errors';
import { periodChange } from '@/lib/insights';
import { formatMinor } from '@/lib/money';
import { navigation } from '@/lib/navigation';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

/** Sections the Commerce API still has no endpoints for. */
const AWAITING_API = new Set(['/inventory', '/customers', '/promotions']);

const INSIGHT_DAYS = 30;
const INSIGHT_PERIOD = `${INSIGHT_DAYS} days`;

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Your last 30 days against the 30 before, over your own order lines — the
 * same report the platform uses, so the two never disagree about a sale.
 */
async function SellerInsights({ balance }: { balance: string }) {
  const to = new Date();
  const from = new Date(to.getTime() - (INSIGHT_DAYS - 1) * 86_400_000);
  from.setUTCHours(0, 0, 0, 0);

  let report;
  try {
    report = await backendGetSellerSalesAnalytics(apiClient, {
      from: from.toISOString(),
      to: to.toISOString(),
      interval: 'day',
    });
  } catch (error) {
    return (
      <ApiErrorNotice error={explainMissingRoute(error, 'your sales report')} />
    );
  }

  const { totals, previous, currency } = report;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label={`Your sales, last ${INSIGHT_PERIOD}`}
        value={formatMinor(totals.grossAmount, currency)}
        change={
          previous
            ? periodChange(totals.grossAmount, previous.grossAmount)
            : undefined
        }
        period={INSIGHT_PERIOD}
        href="/analytics"
      />
      <StatTile
        label="Paid orders"
        value={totals.orderCount.toLocaleString('en-GB')}
        change={
          previous
            ? periodChange(totals.orderCount, previous.orderCount)
            : undefined
        }
        period={INSIGHT_PERIOD}
        href="/orders"
      />
      <StatTile
        label="Average order"
        value={formatMinor(totals.averageOrderAmount, currency)}
        change={
          previous
            ? periodChange(
                totals.averageOrderAmount,
                previous.averageOrderAmount,
              )
            : undefined
        }
        period={INSIGHT_PERIOD}
      />
      <StatTile
        label="Balance"
        value={balance}
        note="Owed to you after commission and payouts."
        href="/payments"
      />
    </div>
  );
}

async function SellerAttentionPanels() {
  let attention;
  try {
    attention = await backendGetSellerAttention(apiClient);
  } catch (error) {
    return (
      <ApiErrorNotice error={explainMissingRoute(error, 'your to-do list')} />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Needs attention">
        <AttentionList
          items={[
            {
              label: 'Orders to ship',
              count: attention.ordersToFulfil,
              href: '/orders',
              action: 'Pack and dispatch',
            },
            {
              label: 'Returns',
              count: attention.openReturns,
              href: '/orders',
              action: 'Waiting on a decision or a refund',
            },
            {
              label: 'Submissions in review',
              count: attention.pendingSubmissions,
              href: '/products/submissions',
              action: 'Waiting for the iZyane team',
            },
            {
              label: 'Rejected submissions',
              count: attention.rejectedSubmissions,
              href: '/products/submissions',
              action: 'See why, fix and resubmit',
            },
          ]}
        />
      </Panel>
      <Panel
        title="Running low"
        description={
          attention.outOfStock > 0
            ? `${attention.lowStock} low and ${attention.outOfStock} out of stock.`
            : 'At or under your reorder point, or 3 left where none is set.'
        }
      >
        <LowStockList
          items={attention.lowStockItems}
          total={attention.lowStock + attention.outOfStock}
        />
      </Panel>
      <Panel title="Your rating" description="From verified buyers.">
        {attention.rating.count > 0 ? (
          <p>
            <span className="text-3xl font-semibold tabular-nums">
              {attention.rating.average?.toFixed(1)}
            </span>
            <span className="text-muted-foreground"> out of 5</span>
            <span className="text-muted-foreground block text-sm">
              from {attention.rating.count}{' '}
              {attention.rating.count === 1 ? 'rating' : 'ratings'}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            No ratings yet. Buyers can rate you once an order is delivered.
          </p>
        )}
      </Panel>
    </div>
  );
}

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

  const balanceLabel = balance
    ? formatMinor(balance.balance, balance.currency)
    : 'Unavailable';
  const figures = [
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
      hint: 'Your share of every customer order, all time.',
    },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title={account.seller.displayName ?? account.seller.businessName}
        description={`Signed in as ${user.email}.`}
      />

      <Suspense fallback={null}>
        <SellerInsights balance={balanceLabel} />
      </Suspense>

      <Suspense fallback={null}>
        <SellerAttentionPanels />
      </Suspense>

      <div className="grid gap-4 sm:grid-cols-2">
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
