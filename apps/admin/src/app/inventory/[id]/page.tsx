import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  backendListInventory,
  backendListInventoryMovements,
  backendListInventoryReservations,
  backendListProducts,
  backendListWarehouses,
} from '@commerce/api-client';
import {
  backendInventoryMovementTypes,
  backendReservationStatuses,
  type BackendAdminProduct,
  type BackendWarehouse,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { InventoryReorderForm } from '@/components/inventory-reorder-form';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { buildCatalogIndex } from '@/lib/catalog-labels';
import { withParams } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

import { updateReorderPointAction } from '../actions';
import {
  isBelowReorderPoint,
  movementEffect,
  pageSlice,
  parseHistoryQuery,
} from '../history';

export const metadata: Metadata = { title: 'Stock history' };

const PAGE_SIZE = 25;

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default async function InventoryRecordPage({
  params,
  searchParams,
}: PageProps<'/inventory/[id]'>) {
  await requireAdmin();
  const { id } = await params;
  const query = await searchParams;
  const history = parseHistoryQuery(query);
  const pathname = `/inventory/${id}`;

  // There is no single-record read, so the record is found in the list. The
  // history reads answer an empty list for an id they do not know, which is
  // why the record — not them — decides whether this page is a 404.
  let record;
  let movements;
  let reservations;
  let warehouses: BackendWarehouse[];
  try {
    const [records, movementRows, reservationRows, warehouseRows] =
      await Promise.all([
        backendListInventory(apiClient),
        backendListInventoryMovements(apiClient, id),
        backendListInventoryReservations(apiClient, id),
        backendListWarehouses(apiClient),
      ]);
    record = records.find((candidate) => candidate.id === id);
    movements = movementRows;
    reservations = reservationRows;
    warehouses = warehouseRows;
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Stock history"
          description="Movements and reservations for one stock record."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  if (!record) {
    notFound();
  }

  // Labels only, as on the inventory list: a catalog failure costs the names.
  let products: BackendAdminProduct[] = [];
  try {
    products = await backendListProducts(apiClient);
  } catch {
    products = [];
  }
  const named = buildCatalogIndex(products).byVariant.get(record.variantId);
  const warehouse = warehouses.find(
    (candidate) => candidate.id === record.warehouseId,
  );

  const shownMovements = pageSlice(
    history.type === undefined
      ? movements
      : movements.filter((movement) => movement.type === history.type),
    history.page,
    PAGE_SIZE,
  );
  const shownReservations = pageSlice(
    history.status === undefined
      ? reservations
      : reservations.filter(
          (reservation) => reservation.status === history.status,
        ),
    history.page,
    PAGE_SIZE,
  );
  const shown =
    history.view === 'movements' ? shownMovements : shownReservations;
  const filtered =
    history.view === 'movements'
      ? history.type !== undefined
      : history.status !== undefined;

  const counters = [
    { label: 'On hand', value: record.onHand },
    { label: 'Reserved', value: record.reserved },
    { label: 'Available', value: record.available },
  ];

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/inventory">
            <ArrowLeft data-icon="inline-start" />
            All stock
          </Link>
        </Button>
      </div>

      <PageHeader
        title={named?.productName ?? 'Unnamed product'}
        description={`${named?.sku ?? record.variantId} at ${warehouse ? `${warehouse.name} (${warehouse.code})` : 'an unknown warehouse'}. Every change to these counters is a movement; a reservation is a hold on stock for a cart or checkout.`}
        action={
          isBelowReorderPoint(record) ? (
            <Badge variant="destructive">Due for reorder</Badge>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Stock</CardTitle>
          <CardDescription>
            The record is flagged for reorder once available stock falls to the
            reorder point. Zero means no flag.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-6">
          <dl className="flex flex-wrap gap-8">
            {counters.map((counter) => (
              <div key={counter.label}>
                <dt className="text-muted-foreground text-xs">
                  {counter.label}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {counter.value}
                </dd>
              </div>
            ))}
          </dl>
          <InventoryReorderForm
            reorderPoint={record.reorderPoint}
            action={updateReorderPointAction.bind(null, record.id)}
          />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {/* Two views rather than two tables, so one `page` parameter pages
              whichever list is on screen. */}
          <nav className="flex gap-2" aria-label="History">
            {(
              [
                ['movements', `Movements (${movements.length})`],
                ['reservations', `Reservations (${reservations.length})`],
              ] as const
            ).map(([view, label]) => (
              <Button
                key={view}
                variant={history.view === view ? 'secondary' : 'ghost'}
                size="sm"
                asChild
              >
                <Link
                  href={withParams(pathname, {}, { view })}
                  aria-current={history.view === view ? 'page' : undefined}
                >
                  {label}
                </Link>
              </Button>
            ))}
          </nav>

          <form className="flex flex-wrap items-end gap-2" action={pathname}>
            <input type="hidden" name="view" value={history.view} />
            {history.view === 'movements' ? (
              <>
                <label htmlFor="movement-type" className="sr-only">
                  Movement type
                </label>
                <SelectField
                  id="movement-type"
                  name="type"
                  placeholder="Any type"
                  defaultValue={history.type ?? ''}
                  options={backendInventoryMovementTypes.map((value) => ({
                    value,
                    label: titleCase(value),
                  }))}
                />
              </>
            ) : (
              <>
                <label htmlFor="reservation-status" className="sr-only">
                  Reservation status
                </label>
                <SelectField
                  id="reservation-status"
                  name="status"
                  placeholder="Any status"
                  defaultValue={history.status ?? ''}
                  options={backendReservationStatuses.map((value) => ({
                    value,
                    label: titleCase(value),
                  }))}
                />
              </>
            )}
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            {filtered ? (
              <Button variant="ghost" asChild>
                <Link href={withParams(pathname, {}, { view: history.view })}>
                  Clear
                </Link>
              </Button>
            ) : null}
          </form>
        </div>

        {shown.total === 0 ? (
          <EmptyState
            title={
              filtered
                ? `No matching ${history.view}`
                : history.view === 'movements'
                  ? 'No movements yet'
                  : 'No reservations yet'
            }
            description={
              filtered
                ? 'Nothing on this record matches the filter.'
                : history.view === 'movements'
                  ? 'Receipts, adjustments, and sales against this record will be listed here.'
                  : 'Carts and checkouts that hold stock from this record will be listed here.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            {history.view === 'movements' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Effect</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownMovements.items.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(movement.createdAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={movement.type.toLowerCase()} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {movementEffect(movement.type, movement.quantity)}
                      </TableCell>
                      <TableCell>
                        {movement.referenceType ? (
                          <>
                            <span>{movement.referenceType}</span>
                            {movement.referenceId ? (
                              <p className="text-muted-foreground font-mono text-xs">
                                {movement.referenceId}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-pretty">
                        {movement.note ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Holder</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownReservations.items.map((reservation) => (
                    <TableRow key={reservation.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(reservation.createdAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={reservation.status.toLowerCase()}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {reservation.quantity}
                      </TableCell>
                      <TableCell>
                        {reservation.holderType ? (
                          <>
                            <span>{reservation.holderType}</span>
                            {reservation.holderId ? (
                              <p className="text-muted-foreground font-mono text-xs">
                                {reservation.holderId}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {/* Only a live hold's expiry matters; a settled one
                            keeps the timestamp but it no longer does anything. */}
                        {reservation.status === 'ACTIVE'
                          ? formatTimestamp(reservation.expiresAt)
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        <Pagination
          pathname={pathname}
          params={query}
          page={shown.page}
          pageSize={PAGE_SIZE}
          total={shown.total}
          totalPages={shown.totalPages}
        />
      </div>
    </div>
  );
}
