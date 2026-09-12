import type { Metadata } from 'next';
import Link from 'next/link';

import { backendListPayouts, backendListSellers } from '@commerce/api-client';
import type { BackendSellerSummary } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
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

export const metadata: Metadata = { title: 'Finance' };

const PAGE_SIZE = 20;
/** Enough to label the payouts on a page; the API caps a page at 100. */
const SELLER_LOOKUP_LIMIT = 100;

export default async function FinancePage({
  searchParams,
}: PageProps<'/finance'>) {
  await requireAdmin();
  const params = await searchParams;

  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  let payouts;
  let sellers: BackendSellerSummary[] = [];
  try {
    // A payout names only its seller's id, so the seller list is read
    // alongside it purely to put business names on the rows. Failing to label
    // a payout should not hide it, hence the separate, forgiving read.
    payouts = await backendListPayouts(apiClient, {
      page,
      limit: PAGE_SIZE,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Finance" description="Seller payouts." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  try {
    sellers = (
      await backendListSellers(apiClient, { limit: SELLER_LOOKUP_LIMIT })
    ).items;
  } catch {
    sellers = [];
  }

  const names = new Map(
    sellers.map((seller) => [seller.id, seller.businessName]),
  );
  const totalPages = Math.max(1, Math.ceil(payouts.total / payouts.limit));
  const pageTotal = payouts.items.reduce((sum, row) => sum + row.amount, 0);
  const currency = payouts.items[0]?.currency;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Payouts are bookkeeping: each one records that a seller was paid by other means and debits their ledger to match. Nothing here moves money."
      />

      <Card>
        <CardHeader>
          <CardTitle>Balances live with the seller</CardTitle>
          <CardDescription>
            The API exposes a balance and a ledger per seller rather than across
            all of them, so a seller&apos;s position — and the form for
            recording a payout against it — sits on that seller&apos;s page.
            There is no platform-wide ledger endpoint yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/sellers" className="text-sm font-medium hover:underline">
            Go to sellers →
          </Link>
        </CardContent>
      </Card>

      {payouts.items.length === 0 ? (
        <EmptyState
          title="No payouts recorded"
          description="Once a seller has been paid, record it from their page so their ledger stays in step."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.items.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(payout.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/sellers/${payout.sellerId}`}
                        className="font-medium hover:underline"
                      >
                        {names.get(payout.sellerId) ?? 'View seller'}
                      </Link>
                      {payout.note ? (
                        <p className="text-muted-foreground text-xs text-pretty">
                          {payout.note}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {payout.reference ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinor(payout.amount, payout.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {currency ? (
            <p className="text-muted-foreground text-sm">
              {formatMinor(pageTotal, currency)} on this page.
            </p>
          ) : null}
        </>
      )}

      <Pagination
        pathname="/finance"
        params={params}
        page={payouts.page}
        pageSize={payouts.limit}
        total={payouts.total}
        totalPages={totalPages}
      />
    </div>
  );
}
