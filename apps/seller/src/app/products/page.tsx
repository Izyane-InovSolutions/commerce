import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { listSellerCatalog } from '@commerce/api-client';
import {
  formatMoney,
  sellerCatalogQuerySchema,
  type SellerCatalogView,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StatusBadge } from '@/components/status-badge';
import { StockAdjuster } from '@/components/stock-adjuster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { parseQueryParams } from '@/lib/query';
import { withParams } from '@/lib/search-params';
import { requireSeller } from '@/lib/session';

import { adjustStockAction } from './actions';

export const metadata: Metadata = { title: 'Products' };

const TABS: { view: SellerCatalogView; label: string }[] = [
  { view: 'all', label: 'My Products' },
  { view: 'draft', label: 'Drafts' },
  { view: 'pending', label: 'Pending Approval' },
  { view: 'active', label: 'Approved' },
  { view: 'rejected', label: 'Rejected' },
];

const EMPTY: Record<SellerCatalogView, { title: string; description: string }> =
  {
    all: {
      title: 'Nothing to sell yet',
      description:
        'Add a product to have it put in the catalog, or price a product that is already there.',
    },
    draft: {
      title: 'No drafts',
      description: 'A product you save without submitting appears here.',
    },
    pending: {
      title: 'Nothing awaiting review',
      description:
        'Products you have submitted sit here until an administrator reviews them.',
    },
    active: {
      title: 'Nothing approved yet',
      description:
        'Approved products appear here. They go on sale once you have priced them and hold stock.',
    },
    rejected: {
      title: 'Nothing rejected',
      description:
        'Products turned down for review appear here with the reason.',
    },
  };

export default async function ProductsPage({
  searchParams,
}: PageProps<'/products'>) {
  await requireSeller();
  const params = await searchParams;
  const query = parseQueryParams(sellerCatalogQuerySchema, params);

  let result;
  try {
    result = await listSellerCatalog(apiClient, query);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Products" description="What you sell." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="One row per SKU you sell, with your price and your own stock. The platform owns the product record; you own the price and the quantity."
        action={
          <Button asChild>
            <Link href="/products/new">
              <Plus data-icon="inline-start" />
              Add Product
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        {TABS.map((tab) => (
          <Button
            key={tab.view}
            variant={query.view === tab.view ? 'secondary' : 'ghost'}
            size="sm"
            asChild
          >
            <Link
              href={withParams('/products', params, {
                view: tab.view === 'all' ? undefined : tab.view,
                page: undefined,
              })}
              aria-current={query.view === tab.view ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          </Button>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/products">
        {query.view === 'all' ? null : (
          <input type="hidden" name="view" value={query.view} />
        )}
        <div className="min-w-48 flex-1">
          <label htmlFor="products-q" className="sr-only">
            Search your products
          </label>
          <Input
            id="products-q"
            name="q"
            type="search"
            placeholder="Search product or SKU code"
            defaultValue={query.q ?? ''}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {query.q ? (
          <Button variant="ghost" asChild>
            <Link href={withParams('/products', params, { q: undefined })}>
              Clear
            </Link>
          </Button>
        ) : null}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title={query.q ? 'No matches' : EMPTY[query.view].title}
          description={
            query.q
              ? 'No product or SKU of yours matches that search.'
              : EMPTY[query.view].description
          }
          action={
            <Button asChild>
              <Link href={query.q ? '/products' : '/products/new'}>
                {query.q ? 'Clear search' : 'Add Product'}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Product status</TableHead>
                <TableHead className="text-right">Your price</TableHead>
                <TableHead>Offer</TableHead>
                <TableHead className="text-right">Your stock</TableHead>
                <TableHead className="text-right">Adjust</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((row) => (
                <TableRow key={row.skuId}>
                  <TableCell>
                    {row.submittedByMe ? (
                      <Link
                        href={`/products/${row.productId}`}
                        className="font-medium hover:underline"
                      >
                        {row.productName}
                      </Link>
                    ) : (
                      <span className="font-medium">{row.productName}</span>
                    )}
                    <p className="text-muted-foreground font-mono text-xs">
                      {row.skuCode} · {row.variantName}
                    </p>
                    {row.productStatus === 'rejected' && row.rejectionReason ? (
                      <p className="text-destructive mt-1 max-w-xs text-xs text-pretty">
                        {row.rejectionReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.productStatus} />
                    {row.submittedByMe ? null : (
                      <p className="text-muted-foreground mt-1 text-xs">
                        platform catalog
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.price ? (
                      formatMoney(row.price)
                    ) : (
                      <Button variant="link" size="sm" asChild>
                        <Link href={`/offers/new?q=${row.skuCode}`}>
                          Set a price
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.offerStatus ? (
                      <Link href={`/offers/${row.offerId}`}>
                        <StatusBadge status={row.offerStatus} />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.available === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span className="font-medium">{row.available}</span>
                        <p className="text-muted-foreground text-xs">
                          {row.onHand} on hand · {row.reserved} reserved
                        </p>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.locationId ? (
                      <StockAdjuster
                        skuId={row.skuId}
                        locationId={row.locationId}
                        label={`${row.skuCode} stock`}
                        action={adjustStockAction}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/products"
        params={params}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </div>
  );
}
