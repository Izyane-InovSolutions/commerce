import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetPayoutAccount,
  backendGetSeller,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { PayoutAccountVerifyForm } from '@/components/payout-account-verify-form';
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
import {
  canVerifyPayoutAccount,
  PAYOUT_ACCOUNT_STATUS_HELP,
} from '@/lib/payouts';
import { requireAdmin } from '@/lib/session';

import { verifyPayoutAccountAction } from '../../actions';

export const metadata: Metadata = { title: 'Payout account' };

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `accountNumber` → "Account number". */
function fieldLabel(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * The one place the full destination is shown. The API writes an audit
 * event (`payout_account.destination_viewed`) every time this page reads
 * it, which the page says up front so opening it is a deliberate act.
 */
export default async function PayoutAccountPage({
  params,
}: PageProps<'/finance/payouts/accounts/[id]'>) {
  await requireAdmin(true);
  const { id } = await params;

  let account;
  try {
    account = await backendGetPayoutAccount(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div className="space-y-6">
        <PageHeader
          title="Payout account"
          description="Verify a destination."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  let sellerName: string | null = null;
  try {
    sellerName = (await backendGetSeller(apiClient, account.sellerId))
      .businessName;
  } catch {
    sellerName = null;
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finance/payouts/accounts">
            <ArrowLeft data-icon="inline-start" />
            All payout accounts
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`${account.provider} · ${account.maskedReference}`}
        description={PAYOUT_ACCOUNT_STATUS_HELP[account.status]}
        action={<StatusBadge status={account.status.toLowerCase()} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Destination</CardTitle>
          <CardDescription>
            Viewing this page is recorded in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">Seller</dt>
              <dd>
                <Link
                  href={`/sellers/${account.sellerId}`}
                  className="hover:underline"
                >
                  {sellerName ?? account.sellerId.slice(0, 8)}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Method</dt>
              <dd>{account.method === 'BANK' ? 'Bank' : 'Mobile money'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Account holder</dt>
              <dd>{account.accountHolderName}</dd>
            </div>
            {Object.entries(account.destination).map(([key, value]) => (
              <div key={key}>
                <dt className="text-muted-foreground text-xs">
                  {fieldLabel(key)}
                </dt>
                <dd className="font-mono break-all">{fieldValue(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-xs">
            Added {formatDate(account.createdAt)}
            {account.verifiedAt
              ? ` · reviewed ${formatDate(account.verifiedAt)}`
              : ''}
          </p>
          {account.verificationNote ? (
            <p className="text-muted-foreground text-sm">
              Note: {account.verificationNote}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {canVerifyPayoutAccount(account.status) ? (
        <Card>
          <CardHeader>
            <CardTitle>Verify</CardTitle>
            <CardDescription>
              Check the account holder and number against the seller&apos;s KYC
              documents before verifying.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PayoutAccountVerifyForm
              action={verifyPayoutAccountAction.bind(
                null,
                account.id,
                account.version,
              )}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
