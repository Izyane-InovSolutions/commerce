import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { backendListSellerOffers } from '@commerce/api-client';
import {
  backendProductStatuses,
  currentPrices,
  type BackendProductStatus,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
import { SellerGateNotice } from '@/components/seller-gate-notice';
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
import { readParam } from '@/lib/search-params';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Products' };

const PAGE_SIZE = 20;

const TITLE = 'Products';
const DESCRIPTION = 'What you sell, at your price, against your stock.';

function isStatus(value: string): value is BackendProductStatus {
  return (backendProductStatuses as readonly string[]).includes(value);
}

export default async function ProductsPage({
  searchParams,
}: PageProps<'/products'>) {
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
  const statusParam = readParam(params, 'status');
  const status =
    statusParam !== undefined && isStatus(statusParam)
      ? statusParam
      : undefined;

  let offers;
  try {
    offers = await backendListSellerOffers(apiClient, {
      page,
      limit: PAGE_SIZE,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  // The listing pages but does not filter, so the status filter is applied to
  // the page in hand rather than to the whole catalogue of listings.
  const visible =
    status === undefined
      ? offers.items
      : offers.items.filter((offer) => offer.status === status);

  const totalPages = Math.max(1, Math.ceil(offers.total / offers.limit));

  return (
    <div className="space-y-6">
      <PageHeader
        title={TITLE}
        description="A listing reaches customers only once you publish it and it has a price — and only while the platform's own product and variant are published too."
        action={
          <Button asChild>
            <Link href="/products/new">
              <Plus data-icon="inline-start" />
              List a product
            </Link>
          </Button>
        }
      />

      <form className="flex flex-wrap items-end gap-2" action="/products">
        <label htmlFor="offer-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="offer-status"
          name="status"
          placeholder="Any status"
          defaultValue={status ?? ''}
          options={backendProductStatuses.map((value) => ({
            value,
            label: value.charAt(0) + value.slice(1).toLowerCase(),
          }))}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {status ? (
          <Button variant="ghost" asChild>
            <Link href="/products">Clear</Link>
          </Button>
        ) : null}
      </form>

      {visible.length === 0 ? (
        <EmptyState
          title={status ? 'Nothing with that status' : 'No listings yet'}
          description={
            status
              ? 'No listing on this page is in that state.'
              : 'List a product against one of the platform’s variants to start selling.'
          }
          action={
            <Button asChild>
              <Link href={status ? '/products' : '/products/new'}>
                {status ? 'Clear filter' : 'List a product'}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((offer) => {
                // A listing can be priced in several currencies at once, so
                // every price in force is shown rather than whichever was
                // entered last.
                const prices = currentPrices(offer.prices).sort((left, right) =>
                  left.currency.localeCompare(right.currency),
                );

                return (
                  <TableRow key={offer.id}>
                    <TableCell>
                      <Link
                        href={`/products/${offer.id}`}
                        className="font-medium hover:underline"
                      >
                        {offer.listingTitle ?? 'Untitled listing'}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {offer.sellerSku ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {offer.condition.charAt(0) +
                        offer.condition.slice(1).toLowerCase()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {prices.length > 0 ? (
                        prices
                          .map((price) =>
                            formatMinor(price.amount, price.currency),
                          )
                          .join(' · ')
                      ) : (
                        <span className="text-muted-foreground">No price</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={offer.status.toLowerCase()} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/products"
        params={params}
        page={offers.page}
        pageSize={offers.limit}
        total={offers.total}
        totalPages={totalPages}
      />
    </div>
  );
}
