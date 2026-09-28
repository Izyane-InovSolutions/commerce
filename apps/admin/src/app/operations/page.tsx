import type { Metadata } from 'next';
import Link from 'next/link';

import { backendGetOperationsMetrics } from '@commerce/api-client';
import { defaultBackendCurrency } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { readParam } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

import { parseOperationsRange, type OperationsRange } from './range';

export const metadata: Metadata = { title: 'Operations' };

/**
 * The metrics carry no currency of their own: they sum order totals and
 * refunds, which the API only ever prices in its default currency. Naming
 * that one currency here keeps the figures from being labelled with a guess.
 */
const METRICS_CURRENCY = defaultBackendCurrency;

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The date filter. A plain GET form, so the range lives in the URL and a
 * snapshot can be shared or reloaded as it was.
 */
function RangeFilter({ range }: { range: OperationsRange }) {
  const isFiltered = range.fromDay !== undefined || range.toDay !== undefined;

  return (
    <form className="flex flex-wrap items-end gap-2" action="/operations">
      <div className="space-y-1.5">
        <Label htmlFor="operations-from">From</Label>
        <Input
          id="operations-from"
          name="from"
          type="date"
          defaultValue={range.fromDay ?? ''}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="operations-to">To</Label>
        <Input
          id="operations-to"
          name="to"
          type="date"
          defaultValue={range.toDay ?? ''}
          className="w-40"
        />
      </div>
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      {isFiltered ? (
        <Button variant="ghost" asChild>
          <Link href="/operations">Last 30 days</Link>
        </Button>
      ) : null}
    </form>
  );
}

export default async function OperationsPage({
  searchParams,
}: PageProps<'/operations'>) {
  await requireAdmin(true);
  const params = await searchParams;
  const range = parseOperationsRange(
    readParam(params, 'from'),
    readParam(params, 'to'),
  );

  const header = (
    <PageHeader
      title="Retail operations"
      description="Sales, fulfillment, stock and returns over a date range. With no range chosen, the API reports the last 30 days; a range can span at most 366 days."
    />
  );

  if (range.error) {
    return (
      <div className="space-y-6">
        {header}
        <RangeFilter range={range} />
        <ApiErrorNotice error={new Error(range.error)} />
      </div>
    );
  }

  let metrics;
  try {
    metrics = await backendGetOperationsMetrics(apiClient, range.query);
  } catch (error) {
    return (
      <div className="space-y-6">
        {header}
        <RangeFilter range={range} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const cards = [
    ['Gross sales', formatMinor(metrics.sales.grossSales, METRICS_CURRENCY)],
    ['Net sales', formatMinor(metrics.sales.netSales, METRICS_CURRENCY)],
    ['Paid orders', String(metrics.sales.paidOrderCount)],
    ['Fulfillment backlog', String(metrics.fulfillment.backlogCount)],
    ['Units available', String(metrics.inventory.available)],
    [
      'Low / out of stock',
      `${metrics.inventory.lowStockCount} / ${metrics.inventory.outOfStockCount}`,
    ],
    ['Returned units', String(metrics.returns.returnedQuantity)],
    [
      'Refund value',
      formatMinor(metrics.returns.refundValue, METRICS_CURRENCY),
    ],
  ] as const;

  return (
    <div className="space-y-8">
      {header}
      <div className="space-y-2">
        <RangeFilter range={range} />
        <p className="text-muted-foreground text-sm">
          Showing {formatDay(metrics.range.from)} to{' '}
          {formatDay(metrics.range.to)} (UTC). The backlog and stock figures
          are as of now, whatever the range.
        </p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h2 className="font-semibold">Orders by status</h2>
          {metrics.ordersByStatus.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              No orders in this range.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {metrics.ordersByStatus.map((row) => (
                <li key={row.status} className="flex justify-between">
                  <span>{row.status}</span>
                  <strong className="tabular-nums">{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border p-4">
          <h2 className="font-semibold">Returns by status</h2>
          {metrics.returns.countsByStatus.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              No returns in this range.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {metrics.returns.countsByStatus.map((row) => (
                <li key={row.status} className="flex justify-between">
                  <span>{row.status}</span>
                  <strong className="tabular-nums">{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
