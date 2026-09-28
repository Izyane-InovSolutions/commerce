import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { SideNav } from '@/components/side-nav';
import { StorefrontCatalog } from '@/components/storefront-catalog';
import {
  listBestSellers,
  listBrands,
  listCategories,
  listProducts,
} from '@/lib/catalog';
import {
  CATALOG_PAGE_SIZE,
  collectAttributeFacets,
  legacyFilterRedirect,
  parseCatalogParams,
  toProductListQuery,
  type AttributeFacet,
} from '@/lib/catalog-query';
import type { Brand, Category } from '@/lib/catalog-types';

export const metadata: Metadata = {
  title: 'All Products',
};

/** How many of a category's products the attribute options are read from —
 * the API's own page-size ceiling. See `collectAttributeFacets`. */
const FACET_SAMPLE_SIZE = 100;

async function readFacets(categorySlug: string): Promise<AttributeFacet[]> {
  try {
    const { products } = await listProducts({
      categorySlug,
      limit: FACET_SAMPLE_SIZE,
    });
    return collectAttributeFacets(products);
  } catch {
    return [];
  }
}

/** Only used to badge cards, so a failure (or the route not existing yet)
 * just means no badges. */
async function readBestSellerIds(): Promise<string[]> {
  try {
    return (await listBestSellers({ limit: 24 })).map((product) => product.id);
  } catch {
    return [];
  }
}

async function readBrands(): Promise<Brand[]> {
  try {
    return await listBrands();
  } catch {
    return [];
  }
}

export default async function ProductsPage({
  searchParams,
}: PageProps<'/products'>) {
  const search = await searchParams;
  const legacy = legacyFilterRedirect(search);
  if (legacy) {
    redirect(legacy);
  }

  const params = parseCatalogParams(search);

  // The listing and categories are what the page is; brands, attribute
  // options and best-seller badges only refine it, so each of those fails
  // on its own without taking the listing down.
  const [main, brands, facets, bestSellerIds] = await Promise.all([
    Promise.all([
      listProducts(toProductListQuery(params, CATALOG_PAGE_SIZE)),
      listCategories(),
    ]).then(
      ([result, categories]) => ({ ok: true, result, categories }) as const,
      (error: unknown) => ({ ok: false, error }) as const,
    ),
    readBrands(),
    params.category ? readFacets(params.category) : Promise.resolve([]),
    readBestSellerIds(),
  ]);
  const categories: Category[] = main.ok ? main.categories : [];

  return (
    <div className="flex flex-col gap-10 px-4 py-12 sm:flex-row">
      <SideNav categories={categories} />

      <div className="min-w-0 flex-1 space-y-6">
        {!main.ok ? (
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              All Products
            </h2>
            <ApiErrorNotice error={main.error} />
          </div>
        ) : (
          <StorefrontCatalog
            products={main.result.products}
            total={main.result.total}
            pageSize={CATALOG_PAGE_SIZE}
            params={params}
            categories={categories}
            brands={brands}
            facets={facets}
            bestSellerIds={bestSellerIds}
            title="All Products"
            description="Browse by category or brand, refine by option, and sort by name or date added."
          />
        )}
      </div>
    </div>
  );
}
