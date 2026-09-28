import { DealsBand } from '@/components/deals-band';
import { ProductRail } from '@/components/product-rail';
import { RecentlyViewedRail } from '@/components/recently-viewed-rail';
import { StorefrontCatalog } from '@/components/storefront-catalog';
import { TrendingHero } from '@/components/trending-hero';
import { WishlistRail } from '@/components/wishlist-rail';
import { labelOffers, type OfferLabel } from '@/lib/cart';
import { parseCatalogParams } from '@/lib/catalog-query';
import {
  listBestSellers,
  listCategories,
  listDeals,
  listFeatured,
  listProducts,
} from '@/lib/catalog';
import type { Category, Product } from '@/lib/catalog-types';
import type { WishlistItemView } from '@/lib/commerce-types';
import { buildCategoryTree } from '@/lib/menu-data';
import { getRecommendations } from '@/lib/recommendations';
import { getCurrentUser } from '@/lib/session';
import { listWishlist } from '@/lib/wishlist';

const HERO_PRODUCT_LIMIT = 6;
const SHELF_LIMIT = 10;
/** Top-level categories that get a shelf of their own, in menu order. */
const CATEGORY_SHELVES = 3;

/** Every shelf is optional: one the API can't fill shows nothing. */
const none = <T,>(): T[] => [];

async function getWishlistShelf(): Promise<{
  items: WishlistItemView[];
  labels: Map<string, OfferLabel>;
}> {
  const empty = { items: [], labels: new Map<string, OfferLabel>() };
  if (!(await getCurrentUser())) return empty;
  try {
    const items = (await listWishlist()).filter((item) => item.isAvailable);
    const labels = await labelOffers(items.map((item) => item.offerId));
    return { items, labels };
  } catch {
    return empty;
  }
}

async function getCategoryShelves(
  categories: Category[],
): Promise<{ category: Category; products: Product[] }[]> {
  const shelves = await Promise.all(
    buildCategoryTree(categories)
      .slice(0, CATEGORY_SHELVES)
      .map(async ({ category }) => ({
        category,
        // Sub-categories included, so "Electronics" shows its phones.
        products: await listProducts({
          categorySlug: category.slug,
          limit: SHELF_LIMIT,
        })
          .then((result) => result.products)
          .catch(none<Product>),
      })),
  );
  return shelves.filter((shelf) => shelf.products.length > 0);
}

export default async function HomePage() {
  let total = 0;
  let latest: Product[] = [];
  let catalogError = false;
  try {
    const result = await listProducts({ limit: 24 });
    latest = result.products;
    total = result.total;
  } catch {
    catalogError = true;
  }

  const categories = await listCategories().catch(none<Category>);
  const [bestSellers, deals, featured, recommended, wishlist, categoryShelves] =
    await Promise.all([
      listBestSellers({ limit: HERO_PRODUCT_LIMIT }).catch(none<Product>),
      listDeals(8).catch(none<Product>),
      listFeatured(SHELF_LIMIT).catch(none<Product>),
      getRecommendations(categories, SHELF_LIMIT).catch(() => null),
      getWishlistShelf(),
      getCategoryShelves(categories),
    ]);

  // The hero leads with what's actually selling; before anything has sold
  // it shows the featured picks, then the newest — and says which.
  const hero =
    bestSellers.length > 0
      ? { products: bestSellers, label: 'Trending now' }
      : featured.length > 0
        ? { products: featured.slice(0, HERO_PRODUCT_LIMIT), label: 'Featured' }
        : {
            products: latest.slice(0, HERO_PRODUCT_LIMIT),
            label: 'Just arrived',
          };

  return (
    <div className="space-y-12">
      <TrendingHero products={hero.products} label={hero.label} />

      <RecentlyViewedRail />

      <DealsBand products={deals} />

      {recommended ? (
        <ProductRail
          id="recommended-heading"
          title="Recommended for you"
          description={
            recommended.basedOn.length > 0
              ? `More from ${recommended.basedOn.join(' and ')}, which you've been browsing.`
              : 'Based on what you have been browsing.'
          }
          products={recommended.products}
        />
      ) : null}

      <WishlistRail items={wishlist.items} labels={wishlist.labels} />

      {hero.label !== 'Featured' ? (
        <ProductRail
          id="featured-heading"
          title="Featured"
          description="Picked by the iZyane team."
          products={featured}
        />
      ) : null}

      <ProductRail
        id="latest-heading"
        title="Just arrived"
        description="The newest products in the catalog."
        href="/new-arrivals"
        linkLabel="See all new arrivals"
        products={latest.slice(0, SHELF_LIMIT)}
      />

      {categoryShelves.map(({ category, products }) => (
        <ProductRail
          key={category.id}
          id={`category-${category.slug}-heading`}
          title={category.name}
          description={category.description ?? undefined}
          href={`/products?category=${encodeURIComponent(category.slug)}`}
          linkLabel={`Shop all ${category.name}`}
          products={products}
        />
      ))}

      {/* The full, filterable catalog comes last, after the shelves. */}
      <div className="border-t pt-10">
        {catalogError ? (
          <p className="text-muted-foreground text-sm">
            The catalog can&apos;t be loaded right now. Refresh the page to try
            again.
          </p>
        ) : (
          <StorefrontCatalog
            products={latest}
            total={total}
            pageSize={24}
            params={parseCatalogParams({})}
            categories={categories}
            title="All products"
            description="Browse everything by category, brand, name, or date added."
          />
        )}
      </div>
    </div>
  );
}
