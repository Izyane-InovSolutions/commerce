import type { BackendSalesAnalyticsPoint } from '@commerce/contracts';

import { formatMinor } from '@/lib/money';

const dayLabel = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/**
 * Sales per day as columns — one series, one hue, zero-based. Each column
 * names its day and figures on hover (and to assistive tech through the
 * table below it), so the chart never has to be read off an axis to the
 * ngwee.
 */
export function SalesColumns({
  series,
  currency,
}: {
  series: BackendSalesAnalyticsPoint[];
  currency: string;
}) {
  const max = Math.max(0, ...series.map((point) => point.grossAmount));
  if (series.length === 0 || max === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        No sales in this period yet.
      </p>
    );
  }

  const first = series[0]!;
  const last = series[series.length - 1]!;
  const label = (point: BackendSalesAnalyticsPoint) =>
    `${dayLabel.format(new Date(point.periodStart))}: ${formatMinor(
      point.grossAmount,
      currency,
    )} from ${point.orderCount} ${point.orderCount === 1 ? 'order' : 'orders'}`;

  return (
    <figure className="space-y-2">
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>Best day {formatMinor(max, currency)}</span>
      </div>
      <div
        aria-hidden="true"
        className="border-border flex h-44 items-end gap-0.5 border-b"
      >
        {series.map((point) => (
          <div
            key={point.periodStart}
            title={label(point)}
            className="group flex h-full min-w-0 flex-1 items-end"
          >
            <div
              className="w-full rounded-t-[4px] bg-(--chart-series) transition-opacity group-hover:opacity-70"
              style={{
                height:
                  point.grossAmount > 0
                    ? `${Math.max((point.grossAmount / max) * 100, 2)}%`
                    : '0',
              }}
            />
          </div>
        ))}
      </div>
      <figcaption className="text-muted-foreground flex justify-between text-xs">
        <span>{dayLabel.format(new Date(first.periodStart))}</span>
        <span>{dayLabel.format(new Date(last.periodStart))}</span>
      </figcaption>
      <table className="sr-only">
        <caption>Sales by day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Sales</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.periodStart}>
              <td>{dayLabel.format(new Date(point.periodStart))}</td>
              <td>{formatMinor(point.grossAmount, currency)}</td>
              <td>{point.orderCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
