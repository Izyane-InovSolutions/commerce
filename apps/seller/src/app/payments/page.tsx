import type { Metadata } from 'next';

import {
  backendGetOwnBalance,
  backendListOwnLedger,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { StatusBadge } from '@/components/status-badge';
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
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Payments' };

const PAGE_SIZE = 20;

const TITLE = 'Payments';
const DESCRIPTION = 'Your balance, commission, and payouts.';

export default async function PaymentsPage({
  searchParams,
}: PageProps<'/payments'>) {
  await requireUser();
  const account = await getSellerAccount();

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice
        title={TITLE}
        description={DESCRIPTION}
        account={account}
      />
    );
  }

  const params = await searchParams;
  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  let balance;
  let ledger;
  try {
    [balance, ledger] = await Promise.all([
      backendGetOwnBalance(apiClient),
      backendListOwnLedger(apiClient, { page, limit: PAGE_SIZE }),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(ledger.total / ledger.limit));

  return (
    <div className="space-y-6">
      <PageHeader
        title={TITLE}
        description="Every sale, refund, and payout that has moved your balance."
      />

      <Card className="max-w-md">
        <CardHeader>
          <CardDescription>Owed to you</CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {formatMinor(balance.balance, balance.currency)}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm text-pretty">
          Sales less commission, less what has already been paid out. Payouts
          are recorded by an administrator when you are paid.
        </CardContent>
      </Card>

      {ledger.items.length === 0 ? (
        <EmptyState
          title="Nothing on your ledger yet"
          description="Entries appear here as your listings sell."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.type.toLowerCase()} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-pretty">
                    {entry.description ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(entry.grossAmount, entry.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(entry.commissionAmount, entry.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMinor(entry.netAmount, entry.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/payments"
        params={params}
        page={ledger.page}
        pageSize={ledger.limit}
        total={ledger.total}
        totalPages={totalPages}
      />
    </div>
  );
}
