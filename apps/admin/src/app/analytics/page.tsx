import type { Metadata } from 'next';
import Link from 'next/link';

import { backendGetSalesAnalytics } from '@commerce/api-client';
import { backendAnalyticsIntervals, backendCurrencies } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { SalesAreaChart } from '@/components/sales-area-chart';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fillSalesSeries,
  readSalesReportFilters,
  toSalesAnalyticsQuery,
} from '@/lib/analytics';
import { apiClient } from '@/lib/api';
import { explainMissingRoute } from '@/lib/api-route-errors';
import { formatMinor } from '@/lib/money';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Analytics' };

const INTERVAL_LABELS: Record<(typeof backendAnalyticsIntervals)[number], string> =
  { day: 'By day', week: 'By week', month: 'By month' };

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function AnalyticsPage({
  searchParams,
}: PageProps<'/analytics'>) {
  await requireAdmin();
  const params = await searchParams;
  const filters = readSalesReportFilters(params);

  const header = (
    <PageHeader
      title="Analytics"
      description="Sales over a date range — order count, gross value and the products behind it. Dates are UTC and inclusive."
    />
  );

  const filterForm = (
    <form className="flex flex-wrap items-end gap-3" action="/analytics">
      <div className="space-y-1.5">
        <Label htmlFor="analytics-from">From</Label>
        <Input
          id="analytics-from"
          name="from"
          type="date"
          defaultValue={filters.from}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="analytics-to">To</Label>
        <Input
          id="analytics-to"
          name="to"
          type="date"
          defaultValue={filters.to}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="analytics-interval">Interval</Label>
        <SelectField
          id="analytics-interval"
          name="interval"
          defaultValue={filters.interval}
          options={backendAnalyticsIntervals.map((value) => ({
            value,
            label: INTERVAL_LABELS[value],
          }))}
        />
      </div>
      {backendCurrencies.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="analytics-currency">Currency</Label>
          <SelectField
            id="analytics-currency"
            name="currency"
            defaultValue={filters.currency}
            options={backendCurrencies.map((value) => ({ value, label: value }))}
          />
        </div>
      ) : (
        <input type="hidden" name="currency" value={filters.currency} />
      )}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      <Button variant="ghost" asChild>
        <Link href="/analytics">Last 30 days</Link>
      </Button>
    </form>
  );

  let report;
  try {
    report = await backendGetSalesAnalytics(
      apiClient,
      toSalesAnalyticsQuery(filters),
    );
  } catch (error) {
    return (
      <div className="space-y-6">
        {header}
        {filterForm}
        <ApiErrorNotice error={explainMissingRoute(error, 'sales analytics')} />
      </div>
    );
  }

  const range = `${formatDate(filters.from)} – ${formatDate(filters.to)}`;
  const totals = [
    { label: 'Orders', value: String(report.totals.orderCount) },
    {
      label: 'Gross sales',
      value: formatMinor(report.totals.grossAmount, report.currency),
    },
    {
      label: 'Average order',
      value: formatMinor(report.totals.averageOrderAmount, report.currency),
    },
  ];

  return (
    <div className="space-y-6">
      {header}
      {filterForm}

      <dl className="grid gap-3 sm:grid-cols-3">
        {totals.map((total) => (
          <div key={total.label} className="rounded-xl border p-4">
            <dt className="text-muted-foreground text-sm">{total.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {total.value}
            </dd>
          </div>
        ))}
      </dl>

      <SalesAreaChart
        description={`Gross sales ${INTERVAL_LABELS[filters.interval].toLowerCase()}, ${range}.`}
        series={fillSalesSeries(report.series, filters)}
        currency={report.currency}
        interval={filters.interval}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Top products</h2>
        {report.topProducts.length === 0 ? (
          <EmptyState
            title="No products sold in this range"
            description="Widen the date range to see what sold."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units sold</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topProducts.map((product) => (
                  <TableRow key={product.productId}>
                    <TableCell>
                      <Link
                        href={`/catalog/${product.productId}`}
                        className="font-medium hover:underline"
                      >
                        {product.productName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {product.unitsSold}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinor(product.grossAmount, report.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
