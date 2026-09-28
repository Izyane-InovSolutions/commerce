import Link from 'next/link';

import { cn } from '@/lib/utils';

export type AttentionItem = {
  label: string;
  count: number;
  href: string;
  /** What working the queue means, e.g. "Approve or reject". */
  action: string;
};

/**
 * Queues waiting on someone, busiest first; each row goes to the page that
 * works it. Empty queues stay listed but recede, so "nothing to do" is
 * visible rather than inferred from a missing row.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const sorted = [...items].sort((left, right) => right.count - left.count);
  return (
    <ul className="divide-y">
      {sorted.map((item) => (
        <li key={item.href + item.label}>
          <Link
            href={item.href}
            className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5"
          >
            <span className={cn(item.count === 0 && 'text-muted-foreground')}>
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="text-muted-foreground block text-xs">
                {item.count === 0 ? 'Nothing waiting' : item.action}
              </span>
            </span>
            <span
              className={cn(
                'min-w-8 rounded-full px-2 py-0.5 text-center text-sm font-semibold tabular-nums',
                item.count > 0
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'text-muted-foreground',
              )}
            >
              {item.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
