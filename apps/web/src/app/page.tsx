import { Suspense } from 'react';

import { ApiStatusCard } from '@/components/api-status-card';
import { ProductCategorySection } from '@/components/product-category-section';
import { SideNav } from '@/components/side-nav';
import { productCategories } from '@/lib/mock-data/products';

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:flex-row">
      <SideNav />

      <div className="min-w-0 flex-1 space-y-10">
        <section className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Commerce Marketplace storefront
          </h1>
          <p className="text-muted-foreground max-w-2xl text-pretty">
            The customer web client for the Commerce Platform. It consumes the
            same versioned Commerce API as the mobile, seller, and admin
            clients.
          </p>
        </section>

        <Suspense fallback={null}>
          <ApiStatusCard />
        </Suspense>

        {productCategories.map((category) => (
          <ProductCategorySection key={category.slug} category={category} />
        ))}
      </div>
    </div>
  );
}
