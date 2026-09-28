import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { listBestSellers } from '@/lib/catalog';
import type { Product } from '@/lib/catalog-types';

export const metadata: Metadata = {
  title: 'Best Sellers',
};

/** The window the ranking counts sales over — the API's own default. */
const RANKING_DAYS = 30;

export default async function BestSellersPage() {
  let products: Product[];

  try {
    products = await listBestSellers({ limit: 24, days: RANKING_DAYS });
  } catch (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Best Sellers</h1>
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Best Sellers</h1>
        <p className="text-muted-foreground text-sm">
          The most-ordered products over the last {RANKING_DAYS} days, most
          popular first.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
          <p className="font-medium">No best sellers yet</p>
          <p className="text-muted-foreground text-sm">
            Once orders start coming in, the most popular products will be
            ranked here.
          </p>
          <Button asChild size="sm">
            <Link href="/new-arrivals">See what’s new</Link>
          </Button>
        </div>
      ) : (
        <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {products.map((product, index) => (
            <li key={product.id}>
              <ProductCard product={product} badge={`#${index + 1}`} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
