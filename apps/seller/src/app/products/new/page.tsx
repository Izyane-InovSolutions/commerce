import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { backendListPublicProducts } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { OfferForm } from '@/components/offer-form';
import { PageHeader } from '@/components/page-header';
import { SellerGateNotice } from '@/components/seller-gate-notice';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { readParam } from '@/lib/search-params';
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

import { createOfferAction } from '../actions';

export const metadata: Metadata = { title: 'List a product' };

const TITLE = 'List a product';
const DESCRIPTION = 'Sell against a product the platform already carries.';
const SEARCH_LIMIT = 10;

export default async function NewProductPage({
  searchParams,
}: PageProps<'/products/new'>) {
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
  const variantId = readParam(params, 'variantId');
  const query = readParam(params, 'q');

  // A listing attaches to one of the platform's variants, and the only
  // catalogue a seller can read is the public one — so choosing what to sell
  // is a search over that, not a picker over something seller-scoped.
  if (variantId !== undefined) {
    return (
      <div className="space-y-8">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/products/new">
              <ArrowLeft data-icon="inline-start" />
              Choose a different product
            </Link>
          </Button>
        </div>

        <PageHeader
          title={TITLE}
          description="Your title, your SKU, and your price. The variant itself stays the platform's."
        />

        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Your listing</CardTitle>
            <CardDescription>
              It is created as a draft — publish it from the listing page once
              you are happy with it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OfferForm
              action={createOfferAction}
              variantId={variantId}
              submitLabel="Create listing"
              withPrice
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  let results;
  try {
    results = await backendListPublicProducts(apiClient, {
      q: query,
      limit: SEARCH_LIMIT,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const products = results.data;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/products">
            <ArrowLeft data-icon="inline-start" />
            All listings
          </Link>
        </Button>
      </div>

      <PageHeader
        title={TITLE}
        description="Find the product you want to sell, then pick the exact variant. Only published products appear here."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/products/submit">Submit a new product</Link>
          </Button>
        }
      />

      <form className="flex flex-wrap items-end gap-2" action="/products/new">
        <div className="min-w-64 flex-1">
          <label htmlFor="variant-search" className="sr-only">
            Search the catalog
          </label>
          <Input
            id="variant-search"
            name="q"
            type="search"
            placeholder="Search by product name"
            defaultValue={query ?? ''}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {products.length === 0 ? (
        <EmptyState
          title="Nothing matched"
          description={
            query
              ? 'No published product matches that search.'
              : 'The platform has no published products to sell against yet.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {products.map((product) => (
            <li key={product.id} className="rounded-xl border p-4">
              <p className="font-medium">{product.name}</p>
              <p className="text-muted-foreground font-mono text-xs">
                {product.slug}
              </p>

              {product.variants.length === 0 ? (
                <p className="text-muted-foreground mt-3 text-sm">
                  No variants to list against yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y">
                  {product.variants.map((variant) => (
                    <li
                      key={variant.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div>
                        <p className="text-sm">
                          {variant.name ?? 'Default variant'}
                        </p>
                        <p className="text-muted-foreground font-mono text-xs">
                          {variant.skuCode}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" asChild>
                        <Link href={`/products/new?variantId=${variant.id}`}>
                          List this variant
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
