import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { describeChange, type PeriodChange } from '@/lib/insights';
import { cn } from '@/lib/utils';

/**
 * One headline figure with how it moved on the previous period. The change
 * carries an arrow and words as well as colour, so it never relies on
 * colour alone.
 */
export function StatTile({
  label,
  value,
  change,
  period,
  note,
  href,
}: {
  label: string;
  value: string;
  change?: PeriodChange;
  /** e.g. "30 days", for "12% up on the previous 30 days". */
  period?: string;
  /** Shown instead of a change, for figures that aren't trends. */
  note?: string;
  href?: string;
}) {
  const Icon =
    change?.direction === 'up'
      ? ArrowUpRight
      : change?.direction === 'down'
        ? ArrowDownRight
        : Minus;

  const body = (
    <>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {change && period ? (
        <p
          className={cn(
            'mt-2 flex items-center gap-1 text-xs',
            change.direction === 'up' && change.percent !== null
              ? 'text-emerald-700 dark:text-emerald-400'
              : change.direction === 'down'
                ? 'text-red-700 dark:text-red-400'
                : 'text-muted-foreground',
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          {describeChange(change, period)}
        </p>
      ) : note ? (
        <p className="text-muted-foreground mt-2 text-xs">{note}</p>
      ) : null}
    </>
  );

  const frame = 'block rounded-xl border p-4';
  return href ? (
    <Link
      href={href}
      className={cn(frame, 'hover:border-foreground/25 transition-colors')}
    >
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
