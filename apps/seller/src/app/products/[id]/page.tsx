import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ApiError, backendGetSellerOffer } from '@commerce/api-client';
import { backendCurrencies, currentPrices } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OfferForm } from '@/components/offer-form';
import { OfferPriceForm } from '@/components/offer-price-form';
import { OfferStatusControl } from '@/components/offer-status-control';
import { PageHeader } from '@/components/page-header';
import { SellerGateNotice } from '@/components/seller-gate-notice';
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
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

import {
  addOfferPriceAction,
  setOfferStatusAction,
  updateOfferAction,
} from '../actions';

const DEFAULT_CURRENCY = 'ZMW';

export async function generateMetadata({
  params,
}: PageProps<'/products/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    const offer = await backendGetSellerOffer(apiClient, id);
    return { title: offer.listingTitle ?? 'Listing' };
  } catch {
    return { title: 'Listing' };
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function OfferPage({
  params,
}: PageProps<'/products/[id]'>) {
  await requireUser();
  const account = await getSellerAccount();
  const { id } = await params;

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice
        title="Listing"
        description="One of the products you sell."
        account={account}
      />
    );
  }

  let offer;
  try {
    offer = await backendGetSellerOffer(apiClient, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    return (
      <div className="space-y-6">
        <PageHeader
          title="Listing"
          description="One of the products you sell."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const active = currentPrices(offer.prices).sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
  // The price form defaults to a currency the listing is not priced in yet,
  // so the obvious next action is adding the missing one rather than
  // overwriting what is already there.
  const missing = backendCurrencies.find(
    (code: string) => !active.some((price) => price.currency === code),
  );
  const currency = missing ?? active[0]?.currency ?? DEFAULT_CURRENCY;

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/products">
            <ArrowLeft data-icon="inline-start" />
            All listings
          </Link>
        </Button>
      </div>

      <PageHeader
        title={offer.listingTitle ?? 'Untitled listing'}
        description={
          active.length > 0
            ? `Selling at ${active
                .map((price) => formatMinor(price.amount, price.currency))
                .join(' · ')}.`
            : 'No price set — this listing cannot sell until it has one.'
        }
        action={<StatusBadge status={offer.status.toLowerCase()} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Availability</CardTitle>
          <CardDescription>
            Publishing puts this in front of customers, as long as the
            platform&apos;s own product and variant are published too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OfferStatusControl
            current={offer.status}
            version={offer.version}
            action={setOfferStatusAction.bind(null, offer.id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Price</CardTitle>
          <CardDescription>
            A new price takes effect immediately. The previous one is kept, so
            the listing carries its whole history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <OfferPriceForm
            version={offer.version}
            currency={currency}
            action={addOfferPriceAction.bind(null, offer.id)}
          />

          {offer.prices.length === 0 ? null : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>Until</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offer.prices.map((price) => (
                    <TableRow key={price.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(price.startsAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {price.endsAt ? formatDate(price.endsAt) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinor(price.amount, price.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listing details</CardTitle>
          <CardDescription>
            How this appears to customers, and who holds and ships the stock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OfferForm
            action={updateOfferAction.bind(null, offer.id)}
            version={offer.version}
            defaults={offer}
            submitLabel="Save listing"
          />
        </CardContent>
      </Card>
    </div>
  );
}
