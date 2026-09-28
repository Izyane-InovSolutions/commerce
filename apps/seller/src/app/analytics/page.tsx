import type { Metadata } from 'next';
import Link from 'next/link';

import { backendGetSellerSalesAnalytics } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { BarList } from '@/components/bar-list';
import { PageHeader } from '@/components/page-header';
import { SalesColumns } from '@/components/sales-columns';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { StatTile } from '@/components/stat-tile';
import { TopProductsTable } from '@/components/top-products-table';
import { apiClient } from '@/lib/api';
import { explainMissingRoute } from '@/lib/api-route-errors';
import { periodChange } from '@/lib/insights';
import { formatMinor } from '@/lib/money';
import { readParam } from '@/lib/search-params';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics' };

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

function readRange(value: string | undefined): Range {
  const days = Number(value);
  return (RANGES as readonly number[]).includes(days) ? (days as Range) : 30;
}

/**
 * Your sales over a chosen window, compared with the one before: by day,
 * by category, and by product. Everything is over your own order lines —
 * never another seller's share of a mixed order.
 */
export default async function AnalyticsPage({
  searchParams,
}: PageProps<'/analytics'>) {
  await requireUser();
  const account = await getSellerAccount();
  if (account.state !== 'approved') {
    return (
      <SellerGateNotice
        title="Analytics"
        description="Your sales once you're selling."
        account={account}
      />
    );
  }

  const days = readRange(readParam(await searchParams, 'days'));
  const period = `${days} days`;
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
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
      <div className="space-y-6">
        <PageHeader title="Analytics" description="Your sales over time." />
        <ApiErrorNotice
          error={explainMissingRoute(error, 'your sales report')}
        />
      </div>
    );
  }

  const { totals, previous, currency } = report;
  const money = (amount: number) => formatMinor(amount, currency);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Analytics"
          description={`Your item sales over the last ${period}, against the ${period} before.`}
        />
        <nav aria-label="Period" className="flex gap-1 rounded-lg border p-1">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/analytics?days=${range}`}
              aria-current={range === days ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1 text-sm',
                range === days
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {range} days
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Sales"
          value={money(totals.grossAmount)}
          change={
            previous
              ? periodChange(totals.grossAmount, previous.grossAmount)
              : undefined
          }
          period={period}
        />
        <StatTile
          label="Paid orders"
          value={totals.orderCount.toLocaleString('en-GB')}
          change={
            previous
              ? periodChange(totals.orderCount, previous.orderCount)
              : undefined
          }
          period={period}
          href="/orders"
        />
        <StatTile
          label="Average order"
          value={money(totals.averageOrderAmount)}
          change={
            previous
              ? periodChange(
                  totals.averageOrderAmount,
                  previous.averageOrderAmount,
                )
              : undefined
          }
          period={period}
        />
      </div>

      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="text-base font-semibold tracking-tight">
          Sales by day
        </h2>
        <SalesColumns series={report.series} currency={currency} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border p-5">
          <h2 className="text-base font-semibold tracking-tight">
            Sales by category
          </h2>
          <BarList
            empty="Nothing sold in this period."
            items={(report.byCategory ?? []).map((row) => ({
              key: row.categoryId ?? 'none',
              label: row.categoryName,
              value: row.grossAmount,
              display: money(row.grossAmount),
              detail: `${row.unitsSold} sold`,
            }))}
          />
        </section>
        <section className="space-y-4 rounded-xl border p-5">
          <h2 className="text-base font-semibold tracking-tight">
            Best sellers
          </h2>
          <TopProductsTable products={report.topProducts} currency={currency} />
        </section>
      </div>
    </div>
  );
}
