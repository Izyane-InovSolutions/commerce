import {
  ProductCategorySection,
  type ProductSection,
} from '@/components/product-category-section';
import { StorefrontCatalog } from '@/components/storefront-catalog';
import { TrendingHero } from '@/components/trending-hero';
import { parseCatalogParams } from '@/lib/catalog-query';
import { listCategories, listProducts } from '@/lib/catalog';
import {
  // isTrendingProduct,
  type Category,
  type Product,
} from '@/lib/catalog-types';

const HERO_PRODUCT_LIMIT = 6;

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
  let total = 0;
  let allProducts: Product[] = [];
  let categories: Category[] = [];
  let sections: ProductSection[] = [];

  try {
    const [productsResult, categoriesResult, sectionsResult] =
      await Promise.all([
        listProducts({ limit: 24 }),
        listCategories(),
        getHomepageSections(),
      ]);
    allProducts = productsResult.products;
    total = productsResult.total;
    categories = categoriesResult;
    sections = sectionsResult;
  } catch {
    allProducts = [];
    categories = [];
    sections = [];
  }

  const trendingProducts = allProducts
    // .filter((product) => isTrendingProduct(product))
    .slice(0, HERO_PRODUCT_LIMIT);

  // Width and gutters come from the layout's page frame, like every page.
  return (
    <div className="space-y-10">
      <TrendingHero products={trendingProducts} />

      <div className="min-w-0 space-y-12">
        {/* The first page of the catalog, with category, brand and sort controls */}
        <StorefrontCatalog
          products={allProducts}
          total={total}
          pageSize={24}
          params={parseCatalogParams({})}
          categories={categories}
          title="All Products"
          description="Browse products by category, brand, name, or date added."
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
