import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import {
  backendListPurchaseOrders,
  backendListSuppliers,
  backendListWarehouses,
} from '@commerce/api-client';
import {
  backendPurchaseOrderStatuses,
  type BackendPurchaseOrderStatus,
  type BackendSupplier,
  type BackendWarehouse,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { receiptProgress } from '@/lib/procurement';
import { readParam } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Procurement' };

const PAGE_SIZE = 20;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isStatus(value: string): value is BackendPurchaseOrderStatus {
  return (backendPurchaseOrderStatuses as readonly string[]).includes(value);
}

function statusLabel(status: string): string {
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PurchaseOrdersPage({
  searchParams,
}: PageProps<'/procurement'>) {
  await requireAdmin();
  const params = await searchParams;

  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const statusParam = readParam(params, 'status');
  const status =
    statusParam !== undefined && isStatus(statusParam)
      ? statusParam
      : undefined;
  // The API refuses a malformed id outright, so one hand-edited into the
  // address bar is dropped rather than failing the whole page.
  const supplierParam = readParam(params, 'supplierId');
  const supplierId =
    supplierParam !== undefined && UUID_PATTERN.test(supplierParam)
      ? supplierParam
      : undefined;
  const overdue = readParam(params, 'overdue') === 'true';

  const newOrder = (
    <Button asChild>
      <Link href="/procurement/purchase-orders/new">
        <Plus data-icon="inline-start" />
        New purchase order
      </Link>
    </Button>
  );

  let orders;
  try {
    orders = await backendListPurchaseOrders(apiClient, {
      page,
      limit: PAGE_SIZE,
      status,
      supplierId,
      overdue: overdue ? true : undefined,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Purchase orders"
          description="Stock bought in from suppliers."
          action={newOrder}
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // Orders carry ids only. The names are a convenience, so a failure here
  // shows ids rather than taking the list down with it.
  let suppliers: BackendSupplier[] = [];
  let warehouses: BackendWarehouse[] = [];
  try {
    const [supplierPage, warehouseList] = await Promise.all([
      backendListSuppliers(apiClient, { limit: 100 }),
      backendListWarehouses(apiClient),
    ]);
    suppliers = supplierPage.items;
    warehouses = warehouseList;
  } catch {
    suppliers = [];
  }
  const supplierNames = new Map(
    suppliers.map((supplier) => [
      supplier.id,
      supplier.tradingName || supplier.legalName,
    ]),
  );
  const warehouseNames = new Map(
    warehouses.map((warehouse) => [warehouse.id, warehouse.name]),
  );

  const totalPages = Math.max(1, Math.ceil(orders.total / orders.limit));
  const isFiltered =
    status !== undefined || supplierId !== undefined || overdue;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase orders"
        description="A purchase order is drafted, approved by an administrator other than its author, placed with the supplier, then received into its warehouse — in part or in full."
        action={newOrder}
      />

      <form className="flex flex-wrap items-end gap-2" action="/procurement">
        <label htmlFor="po-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="po-status"
          name="status"
          placeholder="Any status"
          defaultValue={status ?? ''}
          options={backendPurchaseOrderStatuses.map((value) => ({
            value,
            label: statusLabel(value),
          }))}
        />
        {suppliers.length > 0 ? (
          <>
            <label htmlFor="po-supplier-filter" className="sr-only">
              Supplier
            </label>
            <SelectField
              id="po-supplier-filter"
              name="supplierId"
              placeholder="Any supplier"
              defaultValue={supplierId ?? ''}
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.tradingName || supplier.legalName,
              }))}
            />
          </>
        ) : null}
        <label className="flex h-8 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="overdue"
            value="true"
            defaultChecked={overdue}
          />
          Overdue only
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/procurement">Clear</Link>
          </Button>
        ) : null}
      </form>

      {orders.items.length === 0 ? (
        <EmptyState
          title={
            isFiltered
              ? 'No purchase orders match'
              : 'No purchase orders yet'
          }
          description={
            isFiltered
              ? 'Nothing matches these filters.'
              : 'Raise a purchase order to buy stock in from a supplier.'
          }
          action={
            isFiltered ? (
              <Button asChild>
                <Link href="/procurement">Clear filters</Link>
              </Button>
            ) : (
              newOrder
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Deliver to</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.items.map((po) => {
                const progress = receiptProgress(po.lines);
                return (
                  <TableRow key={po.id}>
                    <TableCell>
                      <Link
                        href={`/procurement/purchase-orders/${po.id}`}
                        className="font-mono font-medium hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                      {po.revisionNumber > 0 ? (
                        <p className="text-muted-foreground text-xs">
                          Revision {po.revisionNumber}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {supplierNames.get(po.supplierId) ?? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {po.supplierId}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {warehouseNames.get(po.warehouseId) ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {po.expectedDeliveryDate
                        ? formatDate(po.expectedDeliveryDate)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {progress.received} / {progress.ordered}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinor(po.totalAmount, po.currency)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={po.status.toLowerCase()} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/procurement"
        params={params}
        page={orders.page}
        pageSize={orders.limit}
        total={orders.total}
        totalPages={totalPages}
      />
    </div>
  );
}
