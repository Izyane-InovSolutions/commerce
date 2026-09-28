import { Suspense } from 'react';
import Link from 'next/link';

import {
  backendListBrands,
  backendListCategories,
  backendListInventory,
  backendListProducts,
} from '@commerce/api-client';

import { currentPrices } from '@commerce/contracts';

import { CategorySalesPieChart } from '@/components/category-sales-pie-chart';
import { PageHeader } from '@/components/page-header';
import { TransactionsAreaChart } from '@/components/transactions-area-chart';
import { apiClient } from '@/lib/api';
import { sampleCategorySalesShares } from '@/lib/sample-category-sales';
import { sampleTransactionSeries } from '@/lib/sample-transactions';
import { requireAdmin } from '@/lib/session';

/**
 * What can be counted from the endpoints that exist.
 *
 * Deliberately small: the API exposes catalog and inventory today, so these
 * are counts and totals rather than the marketplace charts the portal carried
 * against the stand-in mock. Nothing here is trend-shaped — there is still no
 * orders reporting to trend.
 */
async function CatalogSummary() {
  let stats;
  try {
    const [products, categories, brands, inventory] = await Promise.all([
      backendListProducts(apiClient),
      backendListCategories(apiClient),
      backendListBrands(apiClient),
      backendListInventory(apiClient),
    ]);

    const variants = products.flatMap((product) => product.variants);
    const priced = variants.filter((variant) =>
      // Priced in any currency counts; a variant sold only in pounds is
      // still priced.
      variant.offers.some((offer) => currentPrices(offer.prices).length > 0),
    );

    stats = [
      { label: 'Products', value: products.length, href: '/catalog' },
      {
        label: 'Published',
        value: products.filter((p) => p.status === 'PUBLISHED').length,
        href: '/catalog?status=PUBLISHED',
      },
      {
        label: 'Drafts',
        value: products.filter((p) => p.status === 'DRAFT').length,
        href: '/catalog?status=DRAFT',
      },
      { label: 'Variants priced', value: priced.length, href: '/catalog' },
      {
        label: 'Units available',
        value: inventory.reduce((sum, record) => sum + record.available, 0),
        href: '/inventory',
      },
      {
        label: 'Categories and brands',
        value: categories.length + brands.length,
        href: '/categories',
      },
    ];
  } catch {
    // The status card below reports an unreachable or failing API.
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          className="hover:border-foreground/25 rounded-xl border p-4 transition-colors"
        >
          <p className="text-2xl font-semibold">{stat.value}</p>
          <p className="text-muted-foreground mt-1 text-sm text-pretty">
            {stat.label}
          </p>
        </Link>
      ))}
    </div>
  );
}

/**
 * Best-selling categories, by real category names — see
 * `sampleCategorySalesShares` for why the shares themselves are sample data.
 */
async function CategorySales() {
  let shares;

  try {
    const categories = await backendListCategories(apiClient);
    shares = sampleCategorySalesShares(categories);
  } catch {
    return null;
  }

  return <CategorySalesPieChart shares={shares} />;
}

export default async function OverviewPage() {
  await requireAdmin();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Admin portal"
        description="Manage catalog, inventory, sellers, payments and others."
      />

      <Suspense fallback={null}>
        <CatalogSummary />
      </Suspense>

      <TransactionsAreaChart data={sampleTransactionSeries()} />

      <Suspense fallback={null}>
        <CategorySales />
      </Suspense>
    </div>
  );
}
