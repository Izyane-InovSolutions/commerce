import type { Metadata } from 'next';
import Link from 'next/link';

import { listInventory, listLocations } from '@commerce/api-client';
import { inventoryListQuerySchema } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { InventoryAdjustForm } from '@/components/inventory-adjust-form';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
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
import { requireAdmin } from '@/lib/session';
import { parseQueryParams } from '@/lib/query';

import { adjustInventoryAction } from './actions';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage({
  searchParams,
}: PageProps<'/inventory'>) {
  await requireAdmin();
  const params = await searchParams;
  const query = parseQueryParams(inventoryListQuerySchema, params);

  let result;
  let locations;
  try {
    [result, locations] = await Promise.all([
      listInventory(apiClient, query),
      listLocations(apiClient),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inventory"
          description="On-hand, reserved, and available stock by location."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const isFiltered = Boolean(
    query.q ?? query.locationId ?? query.belowThreshold,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Available is derived by the API as on-hand less reserved. Adjustments post a signed change with a reason, so every movement stays auditable."
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
        <label htmlFor="inventory-location" className="sr-only">
          Location
        </label>
        <SelectField
          id="inventory-location"
          name="locationId"
          placeholder="All locations"
          defaultValue={query.locationId ?? ''}
          options={locations.map((location) => ({
            value: location.id,
            label: location.name,
          }))}
        />
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
          title="No stock records"
          description={
            isFiltered
              ? 'No stock record matches these filters.'
              : 'Stock records appear once the catalog has SKUs.'
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
                <TableHead className="text-right">Damaged</TableHead>
                <TableHead className="text-right">In transit</TableHead>
                <TableHead className="text-right">Adjust</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((level) => (
                <TableRow key={`${level.skuId}-${level.locationId}`}>
                  <TableCell>
                    <Link
                      href={`/catalog/${level.productId}`}
                      className="font-medium hover:underline"
                    >
                      {level.productName}
                    </Link>
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
                    {level.damaged}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {level.inTransit}
                  </TableCell>
                  <TableCell>
                    <InventoryAdjustForm
                      level={level}
                      action={adjustInventoryAction}
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
