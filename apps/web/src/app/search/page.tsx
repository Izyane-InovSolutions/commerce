import type { Metadata } from 'next';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { ProductGrid } from '@/components/product-grid';
import { listProducts } from '@/lib/catalog';
import type { Product } from '@/lib/catalog-types';

export const metadata: Metadata = {
  title: 'Search',
};

const RESULT_LIMIT = 24;

export default async function SearchPage({
  searchParams,
}: PageProps<'/search'>) {
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q.trim() : '';

  if (query.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted-foreground max-w-2xl text-pretty">
          Type what you are looking for in the search box above.
        </p>
      </div>
    );
  }

  let products: Product[] = [];
  let total = 0;
  let failure: unknown = null;

  try {
    ({ products, total } = await listProducts({
      q: query,
      limit: RESULT_LIMIT,
    }));
  } catch (error) {
    failure = error;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Results for “{query}”
        </h1>
        {failure ? null : (
          <p className="text-muted-foreground text-sm">
            {total} {total === 1 ? 'product' : 'products'} found.
          </p>
        )}
      </div>

      {failure ? (
        <ApiErrorNotice error={failure} />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}
