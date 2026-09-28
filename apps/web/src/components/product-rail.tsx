import Link from 'next/link';
import type { ReactNode } from 'react';

import { ProductCard } from '@/components/product-card';
import type { Product } from '@/lib/catalog-types';

/**
 * A homepage shelf's heading: what it is, one line on why these products,
 * and where to see the rest.
 */
export function ShelfHeading({
  id,
  title,
  description,
  href,
  linkLabel = 'See all',
}: {
  id: string;
  title: string;
  description?: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
      <div className="space-y-1">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * A row of product cards: swipes sideways on a phone, lays out as a grid
 * from `lg` up. Renders nothing when there are no products, so a shelf the
 * catalog can't fill (nothing featured yet, no deals running) simply isn't
 * there rather than sitting empty.
 */
export function ProductRail({
  id,
  title,
  description,
  href,
  linkLabel,
  products,
  badge,
}: {
  /** Also the heading's id, so the section is labelled by it. */
  id: string;
  title: string;
  description?: ReactNode;
  href?: string;
  linkLabel?: string;
  products: Product[];
  /** A fixed label for every card on this shelf, e.g. "New". */
  badge?: string;
}) {
  if (products.length === 0) return null;

  return (
    <section aria-labelledby={id} className="space-y-4">
      <ShelfHeading
        id={id}
        title={title}
        description={description}
        href={href}
        linkLabel={linkLabel}
      />
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0">
        {products.map((product) => (
          <li
            key={product.id}
            className="w-44 shrink-0 snap-start sm:w-52 lg:w-auto"
          >
            <ProductCard product={product} badge={badge} />
          </li>
        ))}
      </ul>
    </section>
  );
}
