import { listProducts } from '@/lib/catalog';
import type { Category, Product } from '@/lib/catalog-types';
import { rankInterests, readRecentViews } from '@/lib/recent-views-cookie';

export type Recommendations = {
  products: Product[];
  /** The category names they're drawn from, strongest interest first. */
  basedOn: string[];
};

/** How many of a shopper's top categories feed the shelf. */
const INTEREST_CATEGORIES = 2;

/**
 * "Recommended for you": more from the categories this shopper has been
 * browsing (see `recent_views`), leaving out what they've already opened,
 * alternating between their top interests so one category doesn't crowd
 * out the other. Null for a visitor with no history yet — the shelf then
 * doesn't render rather than guessing.
 */
export async function getRecommendations(
  categories: Category[],
  limit = 10,
): Promise<Recommendations | null> {
  const views = await readRecentViews();
  const interests = rankInterests(views).slice(0, INTEREST_CATEGORIES);
  if (interests.length === 0) return null;

  const seen = new Set(views.map((view) => view.s));
  const pools = await Promise.all(
    interests.map((slug) =>
      listProducts({ categorySlug: slug, limit: limit + seen.size })
        .then((result) =>
          result.products.filter((product) => !seen.has(product.slug)),
        )
        .catch(() => [] as Product[]),
    ),
  );

  const products: Product[] = [];
  const taken = new Set<string>();
  for (let round = 0; products.length < limit; round += 1) {
    let added = false;
    for (const pool of pools) {
      const product = pool[round];
      if (product && !taken.has(product.id) && products.length < limit) {
        products.push(product);
        taken.add(product.id);
        added = true;
      }
    }
    if (!added && pools.every((pool) => round >= pool.length)) break;
  }
  if (products.length === 0) return null;

  const nameOf = new Map(
    categories.map((category) => [category.slug, category.name]),
  );
  return {
    products,
    basedOn: interests
      .map((slug) => nameOf.get(slug))
      .filter((name): name is string => Boolean(name)),
  };
}
