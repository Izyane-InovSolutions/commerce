import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  ApiError,
  backendGetSeller,
  backendGetSellerBalance,
  backendListSellerLedger,
} from '@commerce/api-client';
import type {
  BackendLedgerEntry,
  BackendSellerBalance,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { PayoutForm } from '@/components/payout-form';
import { SellerReviewForm } from '@/components/seller-review-form';
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
import { requireAdmin } from '@/lib/session';

import { recordPayoutAction } from '../../finance/actions';
import { reviewSellerAction } from '../actions';

const LEDGER_PREVIEW = 10;

export async function generateMetadata({
  params,
}: PageProps<'/sellers/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    return { title: (await backendGetSeller(apiClient, id)).businessName };
  } catch {
    return { title: 'Seller' };
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function SellerPage({
  params,
}: PageProps<'/sellers/[id]'>) {
  await requireAdmin();
  const { id } = await params;

  let seller;
  try {
    seller = await backendGetSeller(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    return (
      <div className="space-y-6">
        <PageHeader title="Seller" description="Application and standing." />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // A seller who has never sold has no balance row and no entries. Both reads
  // are separate from the seller itself so a financials failure leaves the
  // review decision — the reason this page exists — still usable.
  let balance: BackendSellerBalance | null = null;
  let ledger: BackendLedgerEntry[] = [];
  try {
    const [balanceResult, ledgerResult] = await Promise.all([
      backendGetSellerBalance(apiClient, id),
      backendListSellerLedger(apiClient, id, { limit: LEDGER_PREVIEW }),
    ]);
    balance = balanceResult;
    ledger = ledgerResult.items;
  } catch {
    balance = null;
  }

  const details: { label: string; value: string }[] = [
    { label: 'Registration number', value: seller.registrationNumber },
    { label: 'Country', value: seller.country },
    { label: 'Business address', value: seller.businessAddress },
    { label: 'Contact email', value: seller.contactEmail },
    { label: 'Applied', value: formatDate(seller.createdAt) },
    {
      label: 'Storefront',
      value: seller.storefrontSlug ?? 'Not claimed',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/sellers">
            <ArrowLeft data-icon="inline-start" />
            All sellers
          </Link>
        </Button>
      </div>

      <PageHeader
        title={seller.businessName}
        description={seller.description ?? 'No storefront description yet.'}
        action={<StatusBadge status={seller.status.toLowerCase()} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Application</CardTitle>
            <CardDescription>
              What the seller submitted when they applied.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt className="text-muted-foreground text-xs">
                    {detail.label}
                  </dt>
                  <dd className="text-pretty">{detail.value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="text-muted-foreground text-xs">Documents</p>
              {seller.documents.length === 0 ? (
                <p>None uploaded.</p>
              ) : (
                <p>
                  {seller.documents.length} uploaded. Each is a private media
                  asset — open one through the API&apos;s signed-URL endpoint
                  rather than by id.
                </p>
              )}
            </div>

            {seller.reviewReason ? (
              <div>
                <p className="text-muted-foreground text-xs">
                  Last decision
                  {seller.reviewedAt
                    ? ` — ${formatDate(seller.reviewedAt)}`
                    : null}
                </p>
                <p className="text-pretty">{seller.reviewReason}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              The reason is recorded against the seller and kept with the
              decision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SellerReviewForm
              status={seller.status}
              version={seller.version}
              action={reviewSellerAction.bind(null, seller.id)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Balance{' '}
            {balance
              ? `— ${formatMinor(balance.balance, balance.currency)}`
              : null}
          </CardTitle>
          <CardDescription>
            What the platform owes this seller: sales less commission, less what
            has already been paid out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {balance === null ? (
            <p className="text-muted-foreground text-sm">
              The ledger could not be read for this seller.
            </p>
          ) : (
            <>
              {ledger.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No ledger entries yet — nothing has been sold, refunded, or
                  paid out.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-muted-foreground">
                            {formatDate(entry.createdAt)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={entry.type.toLowerCase()} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMinor(entry.grossAmount, entry.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMinor(
                              entry.commissionAmount,
                              entry.currency,
                            )}
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

              <div className="space-y-3 border-t pt-6">
                <div>
                  <p className="font-medium">Record a payout</p>
                  <p className="text-muted-foreground text-sm text-pretty">
                    Records that this seller was paid by other means and debits
                    the ledger to match. It does not transfer anything.
                  </p>
                </div>
                <PayoutForm
                  currency={balance.currency}
                  action={recordPayoutAction.bind(null, seller.id)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
