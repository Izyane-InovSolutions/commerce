import type { Metadata } from 'next';

import { StorefrontCatalog } from '@/components/storefront-catalog';
import { listCategories, listProducts } from '@/lib/catalog';
import type { Category, Product } from '@/lib/catalog-types';

export const metadata: Metadata = {
  title: 'All Products',
};

export default async function ProductsPage({
  searchParams,
}: PageProps<'/products'>) {
  const params = searchParams ? await searchParams : {};
  const category =
    typeof params.category === 'string' ? params.category : undefined;
  const filter = typeof params.filter === 'string' ? params.filter : undefined;
  const sort = typeof params.sort === 'string' ? params.sort : undefined;
  const q = typeof params.q === 'string' ? params.q : undefined;

  let products: Product[] = [];
  let categories: Category[] = [];

  try {
    const [productsResult, categoriesResult] = await Promise.all([
      listProducts({ limit: 100 }),
      listCategories(),
    ]);
    products = productsResult.products;
    categories = categoriesResult;
  } catch {
    products = [];
    categories = [];
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12">
      <StorefrontCatalog
        products={products}
        categories={categories}
        initialCategory={category}
        initialFilter={filter}
        initialSort={sort}
        initialQuery={q}
        title="All Products"
        description="Browse all products by category, filter by trending or new arrivals, and find the best deals."
      />
    </div>
  );
}
