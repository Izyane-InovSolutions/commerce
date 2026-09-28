import type { Metadata } from 'next';
import Link from 'next/link';

import { backendListPayoutBatches } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { PayoutBatchButton } from '@/components/payout-batch-button';
import { PayoutNav } from '@/components/payout-nav';
import { StatusBadge } from '@/components/status-badge';
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

import { processPayoutBatchAction } from '../actions';

export const metadata: Metadata = { title: 'Payout batches' };

const PAGE_SIZE = 20;

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PayoutBatchesPage({
  searchParams,
}: PageProps<'/finance/payouts/batches'>) {
  await requireAdmin(true);
  const params = await searchParams;

  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  const header = (
    <>
      <PageHeader
        title="Payouts"
        description="Each batch claims every approved request and hands it to the payout provider. The provider is manual, so a batch never pays anyone — it queues the transfers for you to make and reconcile."
        action={<PayoutBatchButton action={processPayoutBatchAction} />}
      />
      <PayoutNav current="/finance/payouts/batches" />
    </>
  );

  let batches;
  try {
    batches = await backendListPayoutBatches(apiClient, {
      page,
      limit: PAGE_SIZE,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        {header}
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(batches.total / batches.limit));

  return (
    <div className="space-y-6">
      {header}

      {batches.items.length === 0 ? (
        <EmptyState
          title="No batches yet"
          description="Approve a payout request, then run a batch to queue it."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.items.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <Link
                      href={`/finance/payouts/batches/${batch.id}`}
                      className="font-medium hover:underline"
                    >
                      {formatDate(batch.createdAt)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={batch.status.toLowerCase()} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {batch.requestCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(batch.totalAmount, batch.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/finance/payouts/batches"
        params={params}
        page={batches.page}
        pageSize={batches.limit}
        total={batches.total}
        totalPages={totalPages}
      />
    </div>
  );
}
