import { backendGetOperationsMetrics } from '@commerce/api-client';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { requireAdmin } from '@/lib/session';

export default async function OperationsPage() {
  await requireAdmin();
  const metrics = await backendGetOperationsMetrics(apiClient);
  const cards = [
    ['Gross sales', formatMinor(metrics.sales.grossSales, 'ZMW')],
    ['Net sales', formatMinor(metrics.sales.netSales, 'ZMW')],
    ['Paid orders', String(metrics.sales.paidOrderCount)],
    ['Fulfillment backlog', String(metrics.fulfillment.backlogCount)],
    ['Units available', String(metrics.inventory.available)],
    [
      'Low / out of stock',
      `${metrics.inventory.lowStockCount} / ${metrics.inventory.outOfStockCount}`,
    ],
    ['Returned units', String(metrics.returns.returnedQuantity)],
    ['Refund value', formatMinor(metrics.returns.refundValue, 'ZMW')],
  ] as const;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Retail operations"
        description={`Operational snapshot from ${new Date(metrics.range.from).toLocaleDateString('en-GB')} to ${new Date(metrics.range.to).toLocaleDateString('en-GB')}.`}
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h2 className="font-semibold">Orders by status</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {metrics.ordersByStatus.map((row) => (
              <li key={row.status} className="flex justify-between">
                <span>{row.status}</span>
                <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border p-4">
          <h2 className="font-semibold">Returns by status</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {metrics.returns.countsByStatus.map((row) => (
              <li key={row.status} className="flex justify-between">
                <span>{row.status}</span>
                <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
