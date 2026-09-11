import type { Metadata } from 'next';

import {
  backendListInventory,
  backendListProducts,
  backendListWarehouses,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StockMoveForm } from '@/components/stock-move-form';
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

import { moveStockAction } from './actions';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage() {
  await requireAdmin();

  let records;
  let warehouses;
  try {
    [records, warehouses] = await Promise.all([
      backendListInventory(apiClient),
      backendListWarehouses(apiClient),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inventory"
          description="On-hand, reserved, and available stock by warehouse."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // Stock records carry no product or SKU names, so the labels are joined in
  // from the catalog. A failure here costs the names, not the numbers.
  const variantNames = new Map<string, { sku: string; product: string }>();
  try {
    const products = await backendListProducts(apiClient);
    for (const product of products) {
      for (const variant of product.variants) {
        variantNames.set(variant.id, {
          sku: variant.skuCode,
          product: product.name,
        });
      }
    }
  } catch {
    // Left unlabelled below.
  }

  const warehouseNames = new Map(
    warehouses.map((warehouse) => [warehouse.id, warehouse.name]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Available is derived by the API as on-hand less reserved. Receiving and adjusting are recorded as movements, so every change stays auditable."
      />

      {records.length === 0 ? (
        <EmptyState
          title="No stock records"
          description="A record opens the first time stock is received for a variant at a warehouse."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Move stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => {
                const named = variantNames.get(record.variantId);

                return (
                  <TableRow key={record.id}>
                    <TableCell>
                      <span className="font-medium">
                        {named?.product ?? 'Unnamed product'}
                      </span>
                      <p className="text-muted-foreground font-mono text-xs">
                        {named?.sku ?? record.variantId}
                      </p>
                    </TableCell>
                    <TableCell>
                      {warehouseNames.get(record.warehouseId) ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {record.onHand}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {record.reserved}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {record.available}
                    </TableCell>
                    <TableCell>
                      <StockMoveForm
                        warehouseId={record.warehouseId}
                        variantId={record.variantId}
                        label={named?.sku ?? record.variantId}
                        action={moveStockAction}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
