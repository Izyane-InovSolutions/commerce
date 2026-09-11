'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';

import { ProductCard } from '@/components/product-card';

type ProductCategory = {
  title: string;
  products: ComponentProps<typeof ProductCard>['product'][];
};

const INITIAL_VISIBLE_COUNT = 4;

export function ProductCategorySection({
  category,
}: {
  category: ProductCategory;
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
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'View less' : 'View more'}
        </button>
      ) : null}
    </section>
  );
}
