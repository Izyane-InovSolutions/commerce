import Link from 'next/link';

import { barWidths } from '@/lib/insights';

export type BarListItem = {
  key: string;
  label: string;
  value: number;
  /** The value as read, e.g. "K 12,000.00". */
  display: string;
  /** Secondary figure beside the label, e.g. "14 sold". */
  detail?: string;
  href?: string;
};

/**
 * A ranked list with a bar under each row, for "which is biggest" questions
 * (sales by category, top stores). Every row states its value, so the bars
 * only add the comparison — they're hidden from screen readers, and the list
 * reads as a plain ranked table.
 */
export function BarList({
  items,
  empty,
}: {
  items: BarListItem[];
  /** What to say when there's nothing to rank yet. */
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }

  const widths = barWidths(items.map((item) => item.value));
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={item.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {item.href ? (
                <Link href={item.href} className="font-medium hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium">{item.label}</span>
              )}
              {item.detail ? (
                <span className="text-muted-foreground"> · {item.detail}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums">{item.display}</span>
          </div>
          <div aria-hidden="true" className="bg-muted h-2 rounded-full">
            <div
              className="h-2 rounded-full bg-(--chart-series)"
              style={{ width: `${Math.max(widths[index]!, 1)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
