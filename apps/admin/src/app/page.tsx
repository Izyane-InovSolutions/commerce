import { Suspense } from 'react';
import Link from 'next/link';

import {
  backendListBrands,
  backendListCategories,
  backendListInventory,
  backendListProducts,
} from '@commerce/api-client';

import { pickCurrentPrice } from '@commerce/contracts';

import { ApiStatusCard } from '@/components/api-status-card';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

const SECTIONS = [
  { href: '/catalog', label: 'Catalog', live: true },
  { href: '/categories', label: 'Categories', live: true },
  { href: '/brands', label: 'Brands', live: true },
  { href: '/inventory', label: 'Inventory', live: true },
  { href: '/sellers', label: 'Sellers', live: false },
  { href: '/orders', label: 'Orders', live: false },
  { href: '/payments', label: 'Payments', live: false },
  { href: '/finance', label: 'Finance', live: false },
  { href: '/audit', label: 'Audit', live: false },
];

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
      variant.offers.some(
        (offer) => pickCurrentPrice(offer.prices) !== undefined,
      ),
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

export default async function OverviewPage() {
  await requireAdmin();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Admin portal"
        description="Connected to the Commerce API. Catalog, taxonomy, and inventory are live; the sections below marked as waiting have no endpoints yet."
      />

      <Suspense fallback={null}>
        <CatalogSummary />
      </Suspense>

      <Suspense fallback={null}>
        <ApiStatusCard />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Sections</h2>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="hover:border-foreground/25 flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors"
              >
                {section.label}
                <span
                  className={
                    section.live
                      ? 'text-muted-foreground text-xs'
                      : 'text-muted-foreground text-xs italic'
                  }
                >
                  {section.live ? 'live' : 'awaiting API'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
