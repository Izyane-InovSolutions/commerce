import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Not found' };

/**
 * Shown for an unknown path and wherever a page calls `notFound()` — a
 * product, seller or order id that does not exist. `Link` adds the portal's
 * base path itself, so these hrefs stay unprefixed.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <div className="space-y-1">
        <p className="text-muted-foreground font-mono text-xs">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nothing here
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          The page or record you asked for does not exist. It may have been
          deleted, or the link may be out of date.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/">Back to overview</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/catalog">Catalog</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/orders">Orders</Link>
        </Button>
      </div>
    </div>
  );
}
