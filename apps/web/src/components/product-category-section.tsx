import Link from 'next/link';

import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Product } from '@/lib/catalog-types';

export type ProductSection = {
  slug: string;
  title: string;
  products: Product[];
};

const INITIAL_VISIBLE_COUNT = 4;

/** One background gradient per featured category — a one-off visual accent,
 * not something the catalog itself carries, so it's keyed by slug here
 * rather than plumbed through the product data. */
const SECTION_GRADIENTS: Partial<Record<string, string>> = {
  electronics: 'bg-linear-to-br from-slate-700 via-blue-600 to-cyan-500',
  'home-and-living': 'bg-linear-to-br from-cyan-500 via-teal-500 to-emerald-600',
  'outdoor-and-apparel': 'bg-linear-to-br from-orange-600 via-amber-600 to-yellow-500',
};

export function ProductCategorySection({
  category,
}: {
  category: ProductSection;
}) {
  const hasMore = category.products.length > INITIAL_VISIBLE_COUNT;
  const visibleProducts = category.products.slice(0, INITIAL_VISIBLE_COUNT);
  const gradientClassName = SECTION_GRADIENTS[category.slug];

  return (
    <section
      className={cn(
        'space-y-1',
        gradientClassName && cn('rounded-2xl p-6', gradientClassName),
      )}
    >
      <h2
        className={cn(
          'text-xl font-semibold tracking-tight',
          gradientClassName && 'text-white drop-shadow-sm',
        )}
      >
        {category.title}
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-4">
        {visibleProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {hasMore ? (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
        >
          <Link href={`/products?category=${encodeURIComponent(category.slug)}`}>
            View more
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
