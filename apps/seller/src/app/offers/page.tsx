import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { listOffers } from '@commerce/api-client';
import {
  formatMoney,
  offerListQuerySchema,
  offerStatuses,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api';
import { parseQueryParams } from '@/lib/query';
import { requireSeller } from '@/lib/session';

export const metadata: Metadata = { title: 'Offers' };

export default async function OffersPage({
  searchParams,
}: PageProps<'/offers'>) {
  await requireSeller();
  const params = await searchParams;
  const query = parseQueryParams(offerListQuerySchema, params);

  let result;
  try {
    result = await listOffers(apiClient, query);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Offers"
          description="Your offers against catalog SKUs."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const isFiltered = Boolean(query.q ?? query.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers"
        description="You own offers against the shared catalog, not the products themselves. Only active offers are buyable on the storefront."
        action={
          <Button asChild>
            <Link href="/offers/new">
              <Plus data-icon="inline-start" />
              New offer
            </Link>
          </Button>
        }
      />

      <form className="flex flex-wrap items-end gap-2" action="/offers">
        <div className="min-w-48 flex-1">
          <label htmlFor="offers-q" className="sr-only">
            Search offers
          </label>
          <Input
            id="offers-q"
            name="q"
            type="search"
            placeholder="Search product or SKU code"
            defaultValue={query.q ?? ''}
          />
        </div>
        <label htmlFor="offers-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="offers-status"
          name="status"
          placeholder="Any status"
          defaultValue={query.status ?? ''}
          options={offerStatuses.map((status) => ({
            value: status,
            label: status.charAt(0).toUpperCase() + status.slice(1),
          }))}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/offers">Clear</Link>
          </Button>
        ) : null}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title={isFiltered ? 'No matching offers' : 'No offers yet'}
          description={
            isFiltered
              ? 'No offer matches these filters. Try widening the search.'
              : 'Create an offer against a catalog SKU to start selling.'
          }
          action={
            <Button asChild>
              <Link href={isFiltered ? '/offers' : '/offers/new'}>
                {isFiltered ? 'Clear filters' : 'New offer'}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead className="text-right">Handling</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((offer) => (
                <TableRow key={offer.id}>
                  <TableCell>
                    <Link
                      href={`/offers/${offer.id}`}
                      className="font-medium hover:underline"
                    >
                      {offer.productName}
                    </Link>
                    <p className="text-muted-foreground font-mono text-xs">
                      {offer.skuCode} · {offer.variantName}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(offer.price)}
                    {offer.compareAtPrice ? (
                      <span className="text-muted-foreground block text-xs line-through">
                        {formatMoney(offer.compareAtPrice)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{offer.condition}</TableCell>
                  <TableCell>
                    <StatusBadge status={offer.fulfillmentMode} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {offer.handlingTimeDays}d
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={offer.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/offers"
        params={params}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </div>
  );
}
