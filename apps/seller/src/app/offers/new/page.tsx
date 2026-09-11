import type { Metadata } from 'next';
import Link from 'next/link';

import { listOffers, listSkus } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { OfferForm } from '@/components/offer-form';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { readParam } from '@/lib/search-params';
import { requireSeller } from '@/lib/session';

import { createOfferAction } from '../actions';

export const metadata: Metadata = { title: 'New offer' };

export default async function NewOfferPage({
  searchParams,
}: PageProps<'/offers/new'>) {
  await requireSeller();
  const params = await searchParams;
  const q = readParam(params, 'q');

  let available;
  try {
    const [skus, existing] = await Promise.all([
      listSkus(apiClient, { q, pageSize: 100 }),
      listOffers(apiClient, { pageSize: 100 }),
    ]);

    // A seller may hold only one offer per SKU, so hide the ones already taken.
    const taken = new Set(existing.items.map((offer) => offer.skuId));
    available = skus.items.filter((sku) => !taken.has(sku.skuId));
  } catch (error) {
    return <ApiErrorNotice error={error} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New offer"
        description="Choose the catalog SKU you want to sell and set your commercial terms."
      />

      <form
        className="flex max-w-2xl flex-wrap items-end gap-2"
        action="/offers/new"
      >
        <div className="min-w-48 flex-1">
          <label htmlFor="sku-q" className="sr-only">
            Search SKUs
          </label>
          <Input
            id="sku-q"
            name="q"
            type="search"
            placeholder="Search the catalog by product or SKU code"
            defaultValue={q ?? ''}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q ? (
          <Button variant="ghost" asChild>
            <Link href="/offers/new">Clear</Link>
          </Button>
        ) : null}
      </form>

      {available.length === 0 ? (
        <EmptyState
          title={q ? 'No SKUs match that search' : 'Nothing left to offer'}
          description={
            q
              ? 'No catalog SKU matches that search, or you already have an offer on the ones that do.'
              : 'You already have an offer against every SKU in the catalog.'
          }
          action={
            <Button asChild variant="outline">
              <Link href={q ? '/offers/new' : '/offers'}>
                {q ? 'Clear search' : 'Back to offers'}
              </Link>
            </Button>
          }
        />
      ) : (
        <OfferForm action={createOfferAction} skus={available} />
      )}
    </div>
  );
}
