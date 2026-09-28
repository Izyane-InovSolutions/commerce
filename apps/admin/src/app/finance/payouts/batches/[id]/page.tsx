import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetPayoutBatch,
  backendListSellers,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
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
import { PAYOUT_BATCH_STATUS_HELP } from '@/lib/payouts';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Payout batch' };

/** Enough to label a batch's requests; the API caps a page at 100. */
const SELLER_LOOKUP_LIMIT = 100;

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PayoutBatchPage({
  params,
}: PageProps<'/finance/payouts/batches/[id]'>) {
  await requireAdmin(true);
  const { id } = await params;

  let batch;
  try {
    batch = await backendGetPayoutBatch(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Payout batch" description="Requests in one batch." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

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

  const toReconcile = batch.requests.filter(
    (request) => request.status === 'RECONCILIATION_REQUIRED',
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finance/payouts/batches">
            <ArrowLeft data-icon="inline-start" />
            All batches
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`Batch of ${formatDate(batch.createdAt)}`}
        description={PAYOUT_BATCH_STATUS_HELP[batch.status]}
        action={<StatusBadge status={batch.status.toLowerCase()} />}
      />

      <p className="text-muted-foreground text-sm">
        {batch.requestCount} {batch.requestCount === 1 ? 'request' : 'requests'}{' '}
        · {formatMinor(batch.totalAmount, batch.currency)}
        {toReconcile > 0 ? ` · ${toReconcile} still to pay and reconcile` : ''}
      </p>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seller</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batch.requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>
                  <Link
                    href={`/finance/payouts/requests/${request.id}`}
                    className="font-medium hover:underline"
                  >
                    {names.get(request.sellerId) ??
                      `Seller ${request.sellerId.slice(0, 8)}`}
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
    </div>
  );
}
