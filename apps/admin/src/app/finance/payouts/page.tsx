import type { Metadata } from 'next';
import Link from 'next/link';

import {
  backendListPayoutRequests,
  backendListSellers,
} from '@commerce/api-client';
import {
  backendSellerPayoutStatuses,
  type BackendPayoutRequest,
  type BackendSellerPayoutStatus,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { PayoutBatchButton } from '@/components/payout-batch-button';
import { PayoutNav } from '@/components/payout-nav';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
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
import { formatMinor } from '@/lib/money';
import { readParam } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

import { processPayoutBatchAction } from './actions';

export const metadata: Metadata = { title: 'Payouts' };

const PAGE_SIZE = 20;
/** Enough to label a page of requests; the API caps a page at 100. */
const SELLER_LOOKUP_LIMIT = 100;
/** The reconcile queue is shown whole up to this, then paged via the filter. */
const RECONCILE_LIMIT = 50;

function isStatus(value: string): value is BackendSellerPayoutStatus {
  return (backendSellerPayoutStatuses as readonly string[]).includes(value);
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

function RequestsTable({
  requests,
  names,
}: {
  requests: BackendPayoutRequest[];
  names: Map<string, string>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requested</TableHead>
            <TableHead>Seller</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <Link
                  href={`/finance/payouts/requests/${request.id}`}
                  className="font-medium hover:underline"
                >
                  {formatDate(request.createdAt)}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  href={`/sellers/${request.sellerId}`}
                  className="hover:underline"
                >
                  {names.get(request.sellerId) ?? 'View seller'}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {request.payoutAccount.provider} ·{' '}
                <span className="font-mono">
                  {request.payoutAccount.maskedReference}
                </span>
              </TableCell>
              <TableCell>
                <StatusBadge status={request.status.toLowerCase()} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMinor(request.amount, request.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function PayoutRequestsPage({
  searchParams,
}: PageProps<'/finance/payouts'>) {
  await requireAdmin(true);
  const params = await searchParams;

  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const statusParam = readParam(params, 'status');
  const status =
    statusParam !== undefined && isStatus(statusParam)
      ? statusParam
      : undefined;

  const header = (
    <>
      <PageHeader
        title="Payouts"
        description="Sellers request payouts against their available balance. Payouts are manual: the platform does not send money itself."
      />
      <PayoutNav current="/finance/payouts" />
    </>
  );

  let requests;
  let toReconcile;
  try {
    [requests, toReconcile] = await Promise.all([
      backendListPayoutRequests(apiClient, { page, limit: PAGE_SIZE, status }),
      backendListPayoutRequests(apiClient, {
        status: 'RECONCILIATION_REQUIRED',
        limit: RECONCILE_LIMIT,
      }),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        {header}
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // Requests name only their seller's id; the list is read purely to label
  // them, so failing it should not hide the requests.
  let names = new Map<string, string>();
  try {
    const sellers = await backendListSellers(apiClient, {
      limit: SELLER_LOOKUP_LIMIT,
    });
    names = new Map(
      sellers.items.map((seller) => [seller.id, seller.businessName]),
    );
  } catch {
    names = new Map();
  }

  const totalPages = Math.max(1, Math.ceil(requests.total / requests.limit));
  const isFiltered = status !== undefined;

  return (
    <div className="space-y-6">
      {header}

      <Card>
        <CardHeader>
          <CardTitle>How a payout goes out</CardTitle>
          <CardDescription>
            The only payout provider wired up today is manual. Running a batch
            does not pay anyone — it hands each approved request back for you to
            pay by hand and then reconcile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
            <li>
              <Link
                href="/finance/payouts/accounts"
                className="text-foreground font-medium hover:underline"
              >
                Verify the seller&apos;s payout account
              </Link>{' '}
              against their documents.
            </li>
            <li>Approve (or reject) the seller&apos;s request below.</li>
            <li>
              Run a batch. Every approved request moves to{' '}
              <span className="text-foreground">Reconciliation required</span>.
            </li>
            <li>
              Make each transfer from the platform&apos;s bank or mobile-money
              account, then open the request and resolve it with the transfer
              reference — or mark it failed to release the amount back to the
              seller.
            </li>
          </ol>
          <PayoutBatchButton action={processPayoutBatchAction} />
        </CardContent>
      </Card>

      {toReconcile.items.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold">
              Waiting for you to pay and reconcile ({toReconcile.total})
            </h2>
            <p className="text-muted-foreground text-sm">
              Nothing has been sent for these. Open one to see the destination
              and record the outcome.
            </p>
          </div>
          <RequestsTable requests={toReconcile.items} names={names} />
          {toReconcile.total > toReconcile.items.length ? (
            <p className="text-muted-foreground text-sm">
              Showing the first {toReconcile.items.length}.{' '}
              <Link
                href="/finance/payouts?status=RECONCILIATION_REQUIRED"
                className="hover:underline"
              >
                See them all
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-semibold">All requests</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          action="/finance/payouts"
        >
          <label htmlFor="payout-status" className="sr-only">
            Status
          </label>
          <SelectField
            id="payout-status"
            name="status"
            placeholder="Any status"
            defaultValue={status ?? ''}
            options={backendSellerPayoutStatuses.map((value) => ({
              value,
              label: statusLabel(value),
            }))}
          />
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {isFiltered ? (
            <Button variant="ghost" asChild>
              <Link href="/finance/payouts">Clear</Link>
            </Button>
          ) : null}
        </form>

        {requests.items.length === 0 ? (
          <EmptyState
            title={
              isFiltered ? 'No requests with that status' : 'No payout requests'
            }
            description={
              isFiltered
                ? 'No payout request is currently in this state.'
                : 'Requests appear here once a seller with a verified payout account asks to be paid.'
            }
          />
        ) : (
          <RequestsTable requests={requests.items} names={names} />
        )}

        <Pagination
          pathname="/finance/payouts"
          params={params}
          page={requests.page}
          pageSize={requests.limit}
          total={requests.total}
          totalPages={totalPages}
        />
      </section>
    </div>
  );
}
