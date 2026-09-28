import type { Metadata } from 'next';
import Link from 'next/link';

import { backendListReturns } from '@commerce/api-client';
import {
  backendReturnStatuses,
  type BackendReturnStatus,
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
import { formatMinor, totalsByCurrency } from '@/lib/money';
import { readParam } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Returns' };

const PAGE_SIZE = 20;

function isStatus(value: string): value is BackendReturnStatus {
  return (backendReturnStatuses as readonly string[]).includes(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export default async function ReturnsPage({
  searchParams,
}: PageProps<'/returns'>) {
  // Staff may read returns and post receipts and inspections; the review and
  // refund steps on the detail page are ADMIN-only and gated there.
  await requireAdmin();
  const params = await searchParams;

  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const statusParam = readParam(params, 'status');
  const status =
    statusParam !== undefined && isStatus(statusParam)
      ? statusParam
      : undefined;

  let returns;
  try {
    returns = await backendListReturns(apiClient, {
      page,
      limit: PAGE_SIZE,
      status,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Returns"
          description="Customer return requests, from review to refund."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(returns.total / returns.limit));
  const isFiltered = status !== undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Customer return requests, from review to refund. Open one to approve it, record what arrived, inspect it, and raise the refund."
      />

      <form className="flex flex-wrap items-end gap-2" action="/returns">
        <label htmlFor="return-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="return-status"
          name="status"
          placeholder="Any status"
          defaultValue={status ?? ''}
          options={backendReturnStatuses.map((value) => ({
            value,
            label: statusLabel(value),
          }))}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/returns">Clear</Link>
          </Button>
        ) : null}
      </form>

      {returns.items.length === 0 ? (
        <EmptyState
          title={isFiltered ? 'No returns with that status' : 'No returns yet'}
          description={
            isFiltered
              ? 'No return is currently in this state.'
              : 'Returns appear here once a customer asks to send a delivered item back.'
          }
          action={
            isFiltered ? (
              <Button asChild>
                <Link href="/returns">Clear filter</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Item value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.items.map((request) => {
                const units = request.items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                );
                // What the customer paid for the returned units — not what
                // will be refunded, which inspection decides.
                const value = totalsByCurrency(
                  request.items.map((item) => ({
                    amount: item.unitAmount * item.quantity,
                    currency: item.currency,
                  })),
                );
                return (
                  <TableRow key={request.id}>
                    <TableCell>
                      <Link
                        href={`/returns/${request.id}`}
                        className="font-mono text-sm font-medium hover:underline"
                      >
                        {request.rmaNumber ?? request.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/orders/${request.orderId}`}
                        className="text-muted-foreground font-mono text-xs hover:underline"
                      >
                        {request.orderId.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(request.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={request.status.toLowerCase()} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {units}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {value
                        .map((total) => formatMinor(total.amount, total.currency))
                        .join(' · ') || '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/returns"
        params={params}
        page={returns.page}
        pageSize={returns.limit}
        total={returns.total}
        totalPages={totalPages}
      />
    </div>
  );
}
