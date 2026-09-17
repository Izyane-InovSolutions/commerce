import Image from 'next/image';

import heroImage from '@/assets/hero1.png';
import {
  ProductCategorySection,
  type ProductSection,
} from '@/components/product-category-section';
import { SideNav } from '@/components/side-nav';
import { StorefrontCatalog } from '@/components/storefront-catalog';
import { listCategories, listProducts } from '@/lib/catalog';
import type { Category, Product } from '@/lib/catalog-types';

const HOMEPAGE_CATEGORIES = [
  { slug: 'electronics', title: 'Electronics' },
  { slug: 'home-and-living', title: 'Home & Living' },
  { slug: 'outdoor-and-apparel', title: 'Outdoor & Apparel' },
] as const;

async function getHomepageSections(): Promise<ProductSection[]> {
  try {
    const sections = await Promise.all(
      HOMEPAGE_CATEGORIES.map(async (category) => {
        const { products } = await listProducts({
          categorySlug: category.slug,
          sort: 'createdAt:desc',
          limit: 8,
        });
        return { slug: category.slug, title: category.title, products };
      }),
    );

    return sections.filter((section) => section.products.length > 0);
  } catch {
    // The catalog API may be unreachable or unseeded; show an empty
    // storefront rather than crashing the homepage.
    return [];
  }
}

export default async function HomePage() {
  let allProducts: Product[] = [];
  let categories: Category[] = [];
  let sections: ProductSection[] = [];

  try {
    const [productsResult, categoriesResult, sectionsResult] =
      await Promise.all([
        listProducts({ limit: 100 }),
        listCategories(),
        getHomepageSections(),
      ]);
    allProducts = productsResult.products;
    categories = categoriesResult;
    sections = sectionsResult;
  } catch {
    allProducts = [];
    categories = [];
    sections = [];
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:flex-row">
      <SideNav categories={categories} />

      <div className="min-w-0 flex-1 space-y-12">
        

        {/* Interactive Storefront Catalog with Categories & Trending Filters */}
        <StorefrontCatalog
          products={allProducts}
          categories={categories}
          title="All Products"
          description="Browse by category, filter by trending or new arrivals, and sort by price."
        />

        {/* Featured Category Spotlights */}
        {sections.length > 0 ? (
          <div className="space-y-10 border-t pt-10">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">
                Featured Collections
              </h2>
              <p className="text-sm text-muted-foreground">
                Hand-picked collections organized by category.
              </p>
            </div>
            {sections.map((section) => (
              <ProductCategorySection key={section.slug} category={section} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
