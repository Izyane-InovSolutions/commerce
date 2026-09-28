import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetPayoutRequest,
  backendGetSeller,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { PayoutResolveForm } from '@/components/payout-resolve-form';
import { PayoutReviewForm } from '@/components/payout-review-form';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import {
  describePayoutEventAction,
  PAYOUT_STATUS_HELP,
  payoutRequestActions,
} from '@/lib/payouts';
import { requireAdmin } from '@/lib/session';

import {
  resolvePayoutRequestAction,
  reviewPayoutRequestAction,
} from '../../actions';

export const metadata: Metadata = { title: 'Payout request' };

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PayoutRequestPage({
  params,
}: PageProps<'/finance/payouts/requests/[id]'>) {
  await requireAdmin(true);
  const { id } = await params;

  let request;
  try {
    request = await backendGetPayoutRequest(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        <PageHeader
          title="Payout request"
          description="Review and reconcile."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // Only for the seller's name; a failed read leaves a link instead.
  let sellerName: string | null = null;
  try {
    sellerName = (await backendGetSeller(apiClient, request.sellerId))
      .businessName;
  } catch {
    sellerName = null;
  }

  const actions = payoutRequestActions(request.status);
  const reviewDecisions = actions.filter(
    (action): action is 'approve' | 'reject' | 'retry' => action !== 'resolve',
  );
  const account = request.payoutAccount;
  const amountLabel = formatMinor(request.amount, request.currency);
  // Set when the batch refused to submit it (seller or account no longer
  // eligible) — in which case it must not be paid, only failed.
  const latestFailure = [...request.attempts]
    .reverse()
    .find((attempt) => attempt.failureReason)?.failureReason;

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finance/payouts">
            <ArrowLeft data-icon="inline-start" />
            All payout requests
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`${amountLabel} to ${sellerName ?? 'seller'}`}
        description={PAYOUT_STATUS_HELP[request.status]}
        action={<StatusBadge status={request.status.toLowerCase()} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">Seller</dt>
              <dd>
                <Link
                  href={`/sellers/${request.sellerId}`}
                  className="hover:underline"
                >
                  {sellerName ?? request.sellerId.slice(0, 8)}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Requested</dt>
              <dd>{formatDate(request.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Batch</dt>
              <dd>
                {request.batchId ? (
                  <Link
                    href={`/finance/payouts/batches/${request.batchId}`}
                    className="font-mono hover:underline"
                  >
                    {request.batchId.slice(0, 8)}
                  </Link>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Destination</dt>
              <dd>
                {account.provider} ·{' '}
                <span className="font-mono">{account.maskedReference}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Account holder</dt>
              <dd>{account.accountHolderName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Account status</dt>
              <dd>
                <StatusBadge status={account.status.toLowerCase()} />
              </dd>
            </div>
          </dl>
          <Link
            href={`/finance/payouts/accounts/${account.id}`}
            className="text-sm font-medium hover:underline"
          >
            Reveal the full destination →
          </Link>
          {request.cancellationReason ? (
            <p className="text-muted-foreground text-sm">
              Reason: {request.cancellationReason}
            </p>
          ) : null}
          {request.failureReason ? (
            <p className="text-destructive text-sm">
              Failed: {request.failureReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {reviewDecisions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {request.status === 'FAILED' ? 'Send again' : 'Review'}
            </CardTitle>
            <CardDescription>
              {request.status === 'FAILED'
                ? 'Queues it for the next batch, which hands it back for reconciling again.'
                : 'Approving queues it for the next batch. Nothing is sent until you make the transfer yourself.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PayoutReviewForm
              decisions={reviewDecisions}
              idempotencyKey={randomUUID()}
              action={reviewPayoutRequestAction.bind(
                null,
                request.id,
                request.version,
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      {actions.includes('resolve') ? (
        <Card>
          <CardHeader>
            <CardTitle>Pay and reconcile</CardTitle>
            <CardDescription>
              The manual provider has not sent anything. Resolving as paid
              debits the seller&apos;s ledger; as failed, it returns the amount
              to their available balance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestFailure ? (
              <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
                {latestFailure}. Check the seller and account before paying — if
                either is no longer approved or verified, mark this failed
                instead.
              </p>
            ) : null}
            <PayoutResolveForm
              amountLabel={amountLabel}
              destinationLabel={`${account.provider} ${account.maskedReference} (${account.accountHolderName})`}
              idempotencyKey={randomUUID()}
              action={resolvePayoutRequestAction.bind(
                null,
                request.id,
                request.version,
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      {request.attempts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {request.attempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"
                >
                  <span>
                    #{attempt.attemptNumber} via {attempt.provider}
                    {attempt.providerReference ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {' '}
                        · {attempt.providerReference}
                      </span>
                    ) : null}
                    {attempt.failureReason ? (
                      <span className="text-muted-foreground block text-xs">
                        {attempt.failureReason}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={attempt.status.toLowerCase()} />
                    <span className="text-muted-foreground text-xs">
                      {formatDate(attempt.startedAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {request.events.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {request.events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    {describePayoutEventAction(event.action)}
                    <StatusBadge status={event.toStatus.toLowerCase()} />
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(event.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
