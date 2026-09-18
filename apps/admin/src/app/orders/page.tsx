import type { Metadata } from 'next';
import Link from 'next/link';

import { backendListAdminOrders } from '@commerce/api-client';
import { backendOrderStatuses, type BackendOrderStatus } from '@commerce/contracts';

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

export const metadata: Metadata = { title: 'Orders' };

const PAGE_SIZE = 20;

function isStatus(value: string): value is BackendOrderStatus {
  return (backendOrderStatuses as readonly string[]).includes(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function OrdersPage({
  searchParams,
}: PageProps<'/orders'>) {
  await requireAdmin();
  const params = await searchParams;

  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const statusParam = readParam(params, 'status');
  const status =
    statusParam !== undefined && isStatus(statusParam)
      ? statusParam
      : undefined;

  let orders;
  try {
    orders = await backendListAdminOrders(apiClient, {
      page,
      limit: PAGE_SIZE,
      status,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Orders"
          description="Every customer order, across every buyer."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(orders.total / orders.limit));
  const isFiltered = status !== undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every customer order, across every buyer. Open one to process its shipping."
      />

      <form className="flex flex-wrap items-end gap-2" action="/orders">
        <label htmlFor="order-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="order-status"
          name="status"
          placeholder="Any status"
          defaultValue={status ?? ''}
          options={backendOrderStatuses.map((value) => ({
            value,
            label: value
              .split('_')
              .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
              .join(' '),
          }))}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/orders">Clear</Link>
          </Button>
        ) : null}
      </form>

      {orders.items.length === 0 ? (
        <EmptyState
          title={isFiltered ? 'No orders with that status' : 'No orders yet'}
          description={
            isFiltered
              ? 'No order is currently in this state.'
              : 'Orders appear here once a shopper checks out.'
          }
          action={
            isFiltered ? (
              <Button asChild>
                <Link href="/orders">Clear filter</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-mono text-sm font-medium hover:underline"
                    >
                      {order.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status.toLowerCase()} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(order.total, order.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/orders"
        params={params}
        page={orders.page}
        pageSize={orders.limit}
        total={orders.total}
        totalPages={totalPages}
      />
    </div>
  );
}
