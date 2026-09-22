'use client';

import Image, { type StaticImageData } from 'next/image';
import { useState } from 'react';

import elBanner from '@/assets/el_banner.png';
import hmBanner from '@/assets/hm_banner.png';
import odBanner from '@/assets/od_banner.png';
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

/** Section background banners */
const SECTION_BANNERS: Partial<Record<string, StaticImageData>> = {
  electronics: elBanner,
  'home-and-living': hmBanner,
  'outdoor-and-apparel': odBanner,
};

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
  const banner = SECTION_BANNERS[category.slug];

  return (
    <section
      className={cn(
        'space-y-4',
        banner && 'relative overflow-hidden rounded-2xl p-6',
      )}
    >
      {banner ? (
        <Image
          src={banner}
          alt=""
          fill
          sizes="100vw"
          className="-z-10 object-cover"
        />
      ) : null}
      <h2 className="text-xl font-semibold tracking-tight">
        {category.title}
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
