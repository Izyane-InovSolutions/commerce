import type { Metadata } from 'next';
import Link from 'next/link';

import { listInventory } from '@commerce/api-client';
import { inventoryListQuerySchema } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StockAdjuster } from '@/components/stock-adjuster';
import { Badge } from '@/components/ui/badge';
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
import { requireSeller } from '@/lib/session';

import { adjustStockAction } from '../products/actions';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage({
  searchParams,
}: PageProps<'/inventory'>) {
  await requireSeller();
  const params = await searchParams;
  const query = parseQueryParams(inventoryListQuerySchema, params);

  let result;
  try {
    result = await listInventory(apiClient, query);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inventory"
          description="Stock for the SKUs you sell."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const isFiltered = Boolean(query.q ?? query.belowThreshold);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="The stock you hold yourself. Available is on hand less what is reserved against open orders, and adjustments are recorded as a signed change so every movement stays auditable."
      />

      <form className="flex flex-wrap items-end gap-2" action="/inventory">
        <div className="min-w-48 flex-1">
          <label htmlFor="inventory-q" className="sr-only">
            Search stock
          </label>
          <Input
            id="inventory-q"
            name="q"
            type="search"
            placeholder="Search product or SKU code"
            defaultValue={query.q ?? ''}
          />
        </div>
        <label className="flex h-8 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="belowThreshold"
            value="true"
            defaultChecked={query.belowThreshold === true}
            className="size-4 rounded border"
          />
          Below reorder point
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/inventory">Clear</Link>
          </Button>
        ) : null}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title={isFiltered ? 'No matching stock' : 'No stock to show'}
          description={
            isFiltered
              ? 'No stock record matches these filters.'
              : 'Stock appears here once you sell a SKU — add a product or price one from the catalog.'
          }
          action={
            <Button asChild>
              <Link href={isFiltered ? '/inventory' : '/products/new'}>
                {isFiltered ? 'Clear filters' : 'Add Product'}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">In transit</TableHead>
                <TableHead className="text-right">Adjust</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((level) => (
                <TableRow key={`${level.skuId}-${level.locationId}`}>
                  <TableCell>
                    <span className="font-medium">{level.productName}</span>
                    <p className="text-muted-foreground font-mono text-xs">
                      {level.skuCode} · {level.variantName}
                    </p>
                  </TableCell>
                  <TableCell>{level.locationName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {level.onHand}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {level.reserved}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      {level.available}
                      {level.available < level.reorderThreshold ? (
                        <Badge variant="destructive">Low</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {level.inTransit}
                  </TableCell>
                  <TableCell>
                    <StockAdjuster
                      skuId={level.skuId}
                      locationId={level.locationId}
                      label={`${level.skuCode} stock`}
                      action={adjustStockAction}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/inventory"
        params={params}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </div>
  );
}
