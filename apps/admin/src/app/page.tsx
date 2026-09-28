import { Suspense } from 'react';
import Link from 'next/link';

import {
  backendGetAdminAttention,
  backendGetSalesAnalytics,
  backendListBrands,
  backendListCategories,
  backendListInventory,
  backendListProducts,
} from '@commerce/api-client';

import { currentPrices, defaultBackendCurrency } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { ApiStatusCard } from '@/components/api-status-card';
import { AttentionList } from '@/components/attention-list';
import { BarList } from '@/components/bar-list';
import { LowStockList } from '@/components/low-stock-list';
import { PageHeader } from '@/components/page-header';
import { SalesAreaChart } from '@/components/sales-area-chart';
import { StatTile } from '@/components/stat-tile';
import { TopProductsTable } from '@/components/top-products-table';
import { Button } from '@/components/ui/button';
import {
  fillSalesSeries,
  toSalesAnalyticsQuery,
  type SalesReportFilters,
} from '@/lib/analytics';
import { apiClient } from '@/lib/api';
import { periodChange } from '@/lib/insights';
import { formatMinor } from '@/lib/money';
import { explainMissingRoute } from '@/lib/api-route-errors';
import { addDays, todayIsoDate } from '@/lib/date-range';
import { navigation, navigationFor } from '@/lib/navigation';
import { readParam } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

/**
 * Every section in the nav, and whether the API behind it is there yet.
 * "Awaiting API" sections still render their `AwaitingBackend` stub —
 * Promotions and Support have no backend module at all.
 */
const SECTIONS = [
  { href: '/catalog', label: 'Catalog', live: true },
  { href: '/categories', label: 'Categories', live: true },
  { href: '/brands', label: 'Brands', live: true },
  { href: '/inventory', label: 'Inventory', live: true },
  { href: '/procurement', label: 'Procurement', live: true },
  { href: '/sellers', label: 'Sellers', live: true },
  { href: '/orders', label: 'Orders', live: true },
  { href: '/payments', label: 'Payments', live: true },
  { href: '/returns', label: 'Returns', live: true },
  { href: '/operations', label: 'Operations', live: true },
  { href: '/moderation', label: 'Moderation', live: true },
  { href: '/finance', label: 'Finance', live: true },
  { href: '/analytics', label: 'Analytics', live: true },
  { href: '/security', label: 'Security', live: true },
  { href: '/audit', label: 'Audit', live: true },
  { href: '/promotions', label: 'Promotions', live: false },
  { href: '/support', label: 'Support', live: false },
];

/** The overview chart's window: one daily series, narrowed in place. */
const OVERVIEW_DAYS = 90;
const OVERVIEW_RANGES = [
  { days: 90, label: 'for the last 3 months' },
  { days: 30, label: 'for the last 30 days' },
  { days: 7, label: 'for the last 7 days' },
];

/**
 * What can be counted from the catalog and inventory endpoints.
 *
 * A failure is shown in place rather than swallowed — an overview that simply
 * lacks its tiles reads as "nothing to count", which is the wrong conclusion.
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
  } catch (error) {
    return <ApiErrorNotice error={error} />;
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

/** The window the headline figures and breakdowns cover. */
const INSIGHT_DAYS = 30;
const INSIGHT_PERIOD = `${INSIGHT_DAYS} days`;

function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-4 rounded-xl border p-5 ${className ?? ''}`}>
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The last 30 days against the 30 before: headline figures, then where the
 * money came from (categories, stores) and what sold. One report feeds all
 * of it, so one failure explains itself once rather than in every card.
 */
async function SalesInsights() {
  const to = todayIsoDate();
  const filters: SalesReportFilters = {
    from: addDays(to, -(INSIGHT_DAYS - 1)),
    to,
    interval: 'day',
    currency: defaultBackendCurrency,
  };

  let report;
  try {
    report = await backendGetSalesAnalytics(
      apiClient,
      toSalesAnalyticsQuery(filters),
    );
  } catch (error) {
    return (
      <ApiErrorNotice error={explainMissingRoute(error, 'sales analytics')} />
    );
  }

  const { totals, previous, currency } = report;
  const money = (amount: number) => formatMinor(amount, currency);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={`Sales, last ${INSIGHT_PERIOD}`}
          value={money(totals.grossAmount)}
          change={
            previous
              ? periodChange(totals.grossAmount, previous.grossAmount)
              : undefined
          }
          period={INSIGHT_PERIOD}
          href="/analytics"
        />
        <StatTile
          label="Paid orders"
          value={totals.orderCount.toLocaleString('en-GB')}
          change={
            previous
              ? periodChange(totals.orderCount, previous.orderCount)
              : undefined
          }
          period={INSIGHT_PERIOD}
          href="/orders"
        />
        <StatTile
          label="Average order"
          value={money(totals.averageOrderAmount)}
          change={
            previous
              ? periodChange(
                  totals.averageOrderAmount,
                  previous.averageOrderAmount,
                )
              : undefined
          }
          period={INSIGHT_PERIOD}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {report.byCategory ? (
          <Panel
            title="Sales by category"
            description={`Item sales over the last ${INSIGHT_PERIOD}, excluding shipping.`}
          >
            <BarList
              empty="No category has sold anything in this period."
              items={report.byCategory.map((row) => ({
                key: row.categoryId ?? 'none',
                label: row.categoryName,
                value: row.grossAmount,
                display: money(row.grossAmount),
                detail: `${row.unitsSold} sold`,
              }))}
            />
          </Panel>
        ) : null}
        {report.topSellers ? (
          <Panel
            title="Top stores"
            description="Who the item sales went through, the platform's own offers included."
          >
            <BarList
              empty="No store has sold anything in this period."
              items={report.topSellers.map((row) => ({
                key: row.sellerId ?? 'first-party',
                label: row.sellerName,
                value: row.grossAmount,
                display: money(row.grossAmount),
                detail: `${row.orderCount} ${row.orderCount === 1 ? 'order' : 'orders'}`,
                href: row.sellerId ? `/sellers/${row.sellerId}` : undefined,
              }))}
            />
          </Panel>
        ) : null}
      </div>

      <Panel
        title="Best sellers"
        description={`By units sold over the last ${INSIGHT_PERIOD}.`}
      >
        <TopProductsTable products={report.topProducts} currency={currency} />
      </Panel>
    </>
  );
}

/** Work queues and stock alerts, filtered to what this user can open. */
async function AttentionPanels({ permitted }: { permitted: Set<string> }) {
  let attention;
  try {
    attention = await backendGetAdminAttention(apiClient);
  } catch (error) {
    return (
      <ApiErrorNotice error={explainMissingRoute(error, 'dashboard alerts')} />
    );
  }

  const queues = [
    {
      section: '/orders',
      label: 'Orders to fulfil',
      count: attention.ordersToFulfil,
      href: '/orders?status=PAID',
      action:
        attention.fulfilmentOnHold > 0
          ? `Pick, pack and ship — ${attention.fulfilmentOnHold} on hold`
          : 'Pick, pack and ship',
    },
    {
      section: '/catalog',
      label: 'Product submissions',
      count: attention.pendingSubmissions,
      href: '/catalog/submissions',
      action: 'Approve or reject',
    },
    {
      section: '/sellers',
      label: 'Seller applications',
      count: attention.pendingSellerApplications,
      href: '/sellers?status=PENDING',
      action: 'Review documents and decide',
    },
    {
      section: '/returns',
      label: 'Returns',
      count: attention.openReturns,
      href: '/returns',
      action: 'Decide, inspect, or retry a refund',
    },
    {
      section: '/finance',
      label: 'Payout requests',
      count: attention.pendingPayoutRequests,
      href: '/finance/payouts?status=REQUESTED',
      action: 'Approve or reject',
    },
    {
      section: '/moderation',
      label: 'Reported reviews',
      count: attention.openReviewReports,
      href: '/moderation',
      action: 'Hide, remove, or dismiss',
    },
  ].filter((queue) => permitted.has(queue.section));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Needs attention">
        <AttentionList items={queues} />
      </Panel>
      <Panel
        title="Running low"
        description={
          attention.outOfStock > 0
            ? `${attention.lowStock} low and ${attention.outOfStock} out of stock.`
            : 'At or under the reorder point, or 3 left where none is set.'
        }
      >
        <LowStockList
          items={attention.lowStockItems}
          total={attention.lowStock + attention.outOfStock}
        />
        {permitted.has('/inventory') ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventory">Open inventory</Link>
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}

/** The last 90 days of sales, by day, from the analytics report. */
async function SalesSummary() {
  const to = todayIsoDate();
  const filters: SalesReportFilters = {
    from: addDays(to, -(OVERVIEW_DAYS - 1)),
    to,
    interval: 'day',
    currency: defaultBackendCurrency,
  };

  let report;
  try {
    report = await backendGetSalesAnalytics(
      apiClient,
      toSalesAnalyticsQuery(filters),
    );
  } catch (error) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Sales</h2>
        <ApiErrorNotice error={explainMissingRoute(error, 'sales analytics')} />
      </section>
    );
  }

  return (
    <SalesAreaChart
      description="Gross sales, by day,"
      series={fillSalesSeries(report.series, filters)}
      currency={report.currency}
      interval="day"
      ranges={OVERVIEW_RANGES}
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/analytics">Open the sales report</Link>
          </Button>
        </div>
      }
    />
  );
}

/**
 * Shown when `requireAdmin(true)` bounced a staff member here from an
 * administrator-only section. It is static rather than dismissible: it goes
 * away with the query string on the next navigation, and a staff member who
 * followed an old link deserves to know why they landed on the overview.
 */
function RestrictedNotice() {
  const adminOnly = new Intl.ListFormat('en-GB').format(
    navigation.filter((item) => item.adminOnly).map((item) => item.label),
  );

  return (
    <div
      role="status"
      className="bg-muted/40 space-y-1 rounded-xl border px-4 py-3"
    >
      <p className="text-sm font-medium">That section is for administrators</p>
      <p className="text-muted-foreground text-sm text-pretty">
        Your staff account can use the sections listed below. {adminOnly} are
        administrator-only — ask an administrator if you need something done
        there.
      </p>
    </div>
  );
}

export default async function OverviewPage({ searchParams }: PageProps<'/'>) {
  const user = await requireAdmin();
  const params = await searchParams;
  const permitted = new Set(navigationFor(user).map((item) => item.href));
  const restricted = readParam(params, 'access') === 'restricted';

  return (
    <div className="space-y-10">
      <PageHeader
        title="Admin portal"
        description="Manage catalog, inventory, sellers, payments and others."
      />

      {restricted ? <RestrictedNotice /> : null}

      <Suspense fallback={null}>
        <SalesInsights />
      </Suspense>

      <Suspense fallback={null}>
        <SalesSummary />
      </Suspense>

      <Suspense fallback={null}>
        <AttentionPanels permitted={permitted} />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Catalog</h2>
        <Suspense fallback={null}>
          <CatalogSummary />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Sections</h2>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {SECTIONS.filter((section) => permitted.has(section.href)).map(
            (section) => (
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
            ),
          )}
        </ul>
      </section>

      <Suspense fallback={null}>
        <ApiStatusCard />
      </Suspense>
    </div>
  );
}
