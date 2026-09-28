import type { Metadata } from 'next';
import Link from 'next/link';

import {
  backendListPayoutAccounts,
  backendListSellers,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
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
import { canVerifyPayoutAccount, sortAccountsForReview } from '@/lib/payouts';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Payout accounts' };

/** Enough to label the accounts; the API caps a page at 100. */
const SELLER_LOOKUP_LIMIT = 100;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PayoutAccountsPage() {
  await requireAdmin(true);

  const header = (
    <>
      <PageHeader
        title="Payouts"
        description="Where each seller wants to be paid. A payout can only be requested against a verified account."
      />
      <PayoutNav current="/finance/payouts/accounts" />
    </>
  );

  let accounts;
  try {
    // The API returns every account unpaged; there are few per seller.
    accounts = sortAccountsForReview(
      await backendListPayoutAccounts(apiClient),
    );
  } catch (error) {
    return (
      <div className="space-y-6">
        {header}
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

  const pending = accounts.filter((account) =>
    canVerifyPayoutAccount(account.status),
  ).length;

  return (
    <div className="space-y-6">
      {header}

      {accounts.length === 0 ? (
        <EmptyState
          title="No payout accounts"
          description="Sellers add a bank or mobile-money account from their portal. It appears here for verification."
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {pending === 0
              ? 'No accounts are waiting for verification.'
              : `${pending} ${pending === 1 ? 'account is' : 'accounts are'} waiting for verification. Open one to check the full destination.`}
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seller</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <Link
                        href={`/finance/payouts/accounts/${account.id}`}
                        className="font-medium hover:underline"
                      >
                        {names.get(account.sellerId) ??
                          `Seller ${account.sellerId.slice(0, 8)}`}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.method === 'BANK' ? 'Bank' : 'Mobile money'} ·{' '}
                      {account.provider}
                    </TableCell>
                    <TableCell>
                      {account.accountHolderName}
                      <span className="text-muted-foreground block font-mono text-xs">
                        {account.maskedReference}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(account.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={account.status.toLowerCase()} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
