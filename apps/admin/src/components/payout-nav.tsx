import Link from 'next/link';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/finance/payouts', label: 'Requests' },
  { href: '/finance/payouts/accounts', label: 'Accounts' },
  { href: '/finance/payouts/batches', label: 'Batches' },
] as const;

/** Tabs across the three payout lists; each is its own route. */
export function PayoutNav({
  current,
}: {
  current: (typeof TABS)[number]['href'];
}) {
  return (
    <nav aria-label="Payouts" className="flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === current ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
            tab.href === current
              ? 'border-foreground'
              : 'text-muted-foreground hover:text-foreground border-transparent',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
