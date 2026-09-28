import Link from 'next/link';

import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Product } from '@/lib/catalog-types';

export type ProductSection = {
  slug: string;
  title: string;
  products: Product[];
  /** Where "View more" goes; the category's own listing by default. */
  href?: string;
};

const INITIAL_VISIBLE_COUNT = 4;

/** Background gradients for featured sections — a purely visual accent,
 * not something the catalog itself carries. Sections are picked from live
 * data, so they're assigned by position rather than keyed by slug. */
const SECTION_GRADIENTS = [
  'bg-linear-to-br from-slate-700 via-blue-600 to-cyan-500',
  'bg-linear-to-br from-cyan-500 via-teal-500 to-emerald-600',
  'bg-linear-to-br from-orange-600 via-amber-600 to-yellow-500',
] as const;

export function ProductCategorySection({
  category,
  accent,
}: {
  category: ProductSection;
  /** Which gradient to draw behind the section, by position; none if unset. */
  accent?: number;
}) {
  const hasMore = category.products.length > INITIAL_VISIBLE_COUNT;
  const visibleProducts = category.products.slice(0, INITIAL_VISIBLE_COUNT);
  const gradientClassName =
    accent === undefined
      ? undefined
      : SECTION_GRADIENTS[accent % SECTION_GRADIENTS.length];

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
          <Link
            href={
              category.href ??
              `/products?category=${encodeURIComponent(category.slug)}`
            }
          >
            View more
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
