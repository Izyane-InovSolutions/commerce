import newArrivalsBanner from '@/assets/nw_banner.png';
import trendingBanner from '@/assets/tr_banner.png';
import {
  ProductCategorySection,
  type ProductSection,
} from '@/components/product-category-section';
import { PromoCarouselCard } from '@/components/promo-carousel-card';
import { SideNav } from '@/components/side-nav';
import { listCategories, listProducts } from '@/lib/catalog';
import { isTrendingProduct, type Category, type Product } from '@/lib/catalog-types';

const PROMO_ITEM_LIMIT = 8;

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
  let newArrivals: Product[] = [];
  let categories: Category[] = [];
  let sections: ProductSection[] = [];

  try {
    const [productsResult, newArrivalsResult, categoriesResult, sectionsResult] =
      await Promise.all([
        listProducts({ limit: 100 }),
        listProducts({ sort: 'createdAt:desc', limit: PROMO_ITEM_LIMIT }),
        listCategories(),
        getHomepageSections(),
      ]);
    allProducts = productsResult.products;
    newArrivals = newArrivalsResult.products;
    categories = categoriesResult;
    sections = sectionsResult;
  } catch {
    allProducts = [];
    newArrivals = [];
    categories = [];
    sections = [];
  }

  const trending = allProducts
    .filter((product) => isTrendingProduct(product))
    .slice(0, PROMO_ITEM_LIMIT);

  return (
    <div className="flex flex-col gap-10 px-4 py-12 sm:flex-row">
      <SideNav categories={categories} />

      <div className="min-w-0 flex-1 space-y-12">
        <div className="grid gap-4 sm:grid-cols-2">
          <PromoCarouselCard
            title="Trending"
            href="/products?filter=trending"
            banner={trendingBanner}
            products={trending}
          />
          <PromoCarouselCard
            title="New Arrivals"
            href="/products?filter=new-arrivals"
            banner={newArrivalsBanner}
            products={newArrivals}
          />
        </div>

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
