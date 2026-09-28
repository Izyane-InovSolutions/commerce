import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { backendListSuppliers } from '@commerce/api-client';
import {
  backendSupplierStatuses,
  type BackendSupplierStatus,
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
import { readParam } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Suppliers' };

const PAGE_SIZE = 20;

function isStatus(value: string): value is BackendSupplierStatus {
  return (backendSupplierStatuses as readonly string[]).includes(value);
}

export default async function SuppliersPage({
  searchParams,
}: PageProps<'/procurement/suppliers'>) {
  await requireAdmin();
  const params = await searchParams;

  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const statusParam = readParam(params, 'status');
  const status =
    statusParam !== undefined && isStatus(statusParam)
      ? statusParam
      : undefined;

  const newSupplier = (
    <Button asChild>
      <Link href="/procurement/suppliers/new">
        <Plus data-icon="inline-start" />
        New supplier
      </Link>
    </Button>
  );

  let suppliers;
  try {
    suppliers = await backendListSuppliers(apiClient, {
      page,
      limit: PAGE_SIZE,
      status,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Suppliers"
          description="Who stock is bought from."
          action={newSupplier}
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(suppliers.total / suppliers.limit));
  const isFiltered = status !== undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Who stock is bought from. A supplier named on a purchase order is deactivated rather than deleted, so the order history keeps resolving."
        action={newSupplier}
      />

      <form
        className="flex flex-wrap items-end gap-2"
        action="/procurement/suppliers"
      >
        <label htmlFor="supplier-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="supplier-status"
          name="status"
          placeholder="Any status"
          defaultValue={status ?? ''}
          options={backendSupplierStatuses.map((value) => ({
            value,
            label: value.charAt(0) + value.slice(1).toLowerCase(),
          }))}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/procurement/suppliers">Clear</Link>
          </Button>
        ) : null}
      </form>

      {suppliers.items.length === 0 ? (
        <EmptyState
          title={
            isFiltered ? 'No suppliers with that status' : 'No suppliers yet'
          }
          description={
            isFiltered
              ? 'No supplier is currently in this state.'
              : 'Add a supplier before raising a purchase order against it.'
          }
          action={
            isFiltered ? (
              <Button asChild>
                <Link href="/procurement/suppliers">Clear filter</Link>
              </Button>
            ) : (
              newSupplier
            )
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Terms</TableHead>
                <TableHead className="text-right">Lead time</TableHead>
                <TableHead className="text-right">Minimum order</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.items.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <Link
                      href={`/procurement/suppliers/${supplier.id}`}
                      className="font-medium hover:underline"
                    >
                      {supplier.tradingName || supplier.legalName}
                    </Link>
                    <p className="text-muted-foreground font-mono text-xs">
                      {supplier.code}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.contactEmail || supplier.contactPhone || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {supplier.paymentTermsDays} days
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {supplier.leadTimeDays} days
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {supplier.minimumOrderAmount == null
                      ? '—'
                      : formatMinor(
                          supplier.minimumOrderAmount,
                          supplier.minimumOrderCurrency ??
                            supplier.defaultCurrency,
                        )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={supplier.status.toLowerCase()} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/procurement/suppliers"
        params={params}
        page={suppliers.page}
        pageSize={suppliers.limit}
        total={suppliers.total}
        totalPages={totalPages}
      />
    </div>
  );
}
