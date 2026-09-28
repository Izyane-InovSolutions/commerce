import type { Metadata } from 'next';
import Link from 'next/link';
import { Tag } from 'lucide-react';

import { DealsBand } from '@/components/deals-band';
import { Button } from '@/components/ui/button';
import { listDeals } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Deals',
};

/**
 * Every product on sale now — a time-limited price below the offer's
 * regular one, set by an admin — biggest saving first. With nothing running
 * it says so and points somewhere useful instead.
 */
export default async function DealsPage() {
  const deals = await listDeals(48).catch(() => []);
  if (deals.length > 0) {
    return <DealsBand products={deals} limit={48} standalone />;
  }

  return (
    <div>
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-dashed p-8 text-center">
        <Tag className="text-muted-foreground mx-auto size-8" aria-hidden="true" />
        <h1 className="text-xl font-semibold tracking-tight">
          No deals running right now
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          When prices are cut for a limited time, you’ll find them here. In
          the meantime, see what other shoppers are buying.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/best-sellers">Best sellers</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/products">All products</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
