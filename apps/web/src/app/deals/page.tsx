import type { Metadata } from 'next';
import Link from 'next/link';
import { Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Deals',
};

/**
 * Kept so old links still land somewhere sensible, but no longer in the
 * navigation: offers carry only their current price — no "was" price and no
 * promotions to compare it against — so there is nothing this page could
 * honestly call a discount yet.
 */
export default function DealsPage() {
  return (
    <div>
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-dashed p-8 text-center">
        <Tag className="text-muted-foreground mx-auto size-8" aria-hidden="true" />
        <h1 className="text-xl font-semibold tracking-tight">
          No deals running right now
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          When sellers put products on offer, you’ll find them here. In the
          meantime, see what other shoppers are buying.
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
