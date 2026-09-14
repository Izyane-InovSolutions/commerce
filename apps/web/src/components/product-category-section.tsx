'use client';

import { useState } from 'react';

import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import type { Product } from '@/lib/catalog-types';

export type ProductSection = {
  slug: string;
  title: string;
  products: Product[];
};

const INITIAL_VISIBLE_COUNT = 4;

export function ProductCategorySection({
  category,
}: {
  category: ProductSection;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasMore = category.products.length > INITIAL_VISIBLE_COUNT;
  const visibleProducts = expanded
    ? category.products
    : category.products.slice(0, INITIAL_VISIBLE_COUNT);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{category.title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visibleProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {hasMore ? (
        <Button
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 aria-expanded:bg-blue-100 aria-expanded:text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
        >
          {expanded ? 'View less' : 'View more'}
        </Button>
      ) : null}
    </section>
  );
}
