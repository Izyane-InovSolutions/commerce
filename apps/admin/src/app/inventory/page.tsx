import type { Metadata } from 'next';

import {
  backendListInventory,
  backendListProducts,
  backendListWarehouses,
} from '@commerce/api-client';
import type { BackendAdminProduct } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ReceiveStockForm } from '@/components/receive-stock-form';
import { StockMoveForm } from '@/components/stock-move-form';
import { WarehouseForm } from '@/components/warehouse-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

import {
  createWarehouseAction,
  moveStockAction,
  receiveStockAction,
} from './actions';

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
  // from the catalog. A failure here costs the names, not the numbers — and
  // with them the variant picker, which is why the receive form is hidden
  // rather than shown empty when this read fails.
  let products: BackendAdminProduct[] = [];
  try {
    products = await backendListProducts(apiClient);
  } catch {
    products = [];
  }

  const variantNames = new Map<string, { sku: string; product: string }>();
  for (const product of products) {
    for (const variant of product.variants) {
      variantNames.set(variant.id, {
        sku: variant.skuCode,
        product: product.name,
      });
    }
  }

  const warehouseNames = new Map(
    warehouses.map((warehouse) => [warehouse.id, warehouse.name]),
  );

  const variantOptions = [...variantNames.entries()].map(([id, named]) => ({
    value: id,
    label: `${named.product} — ${named.sku}`,
  }));

  const warehouseOptions = warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: `${warehouse.name} (${warehouse.code})`,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inventory"
        description="Available is derived by the API as on-hand less reserved. Receiving and adjusting are recorded as movements, so every change stays auditable."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {warehouses.length === 0
              ? 'No warehouses yet'
              : `${warehouses.length} ${warehouses.length === 1 ? 'warehouse' : 'warehouses'}`}
          </CardTitle>
          <CardDescription>
            {warehouses.length === 0
              ? 'Stock is held per warehouse, so nothing can be received until one exists.'
              : warehouses
                  .map((warehouse) => `${warehouse.name} (${warehouse.code})`)
                  .join(', ')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WarehouseForm action={createWarehouseAction} />
        </CardContent>
      </Card>

      {warehouses.length > 0 && variantOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Receive stock</CardTitle>
            <CardDescription>
              Use this the first time a variant is stocked anywhere. Once it has
              a record, the row below is the quicker way to move it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReceiveStockForm
              warehouses={warehouseOptions}
              variants={variantOptions}
              action={receiveStockAction}
            />
          </CardContent>
        </Card>
      ) : null}

      {records.length === 0 ? (
        <EmptyState
          title="No stock records"
          description={
            warehouses.length === 0
              ? 'Create a warehouse first, then receive stock into it.'
              : 'Receive stock for a variant above to open its first record.'
          }
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
