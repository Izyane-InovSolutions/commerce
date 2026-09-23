import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { backendListProducts } from '@commerce/api-client';
import { backendProductStatuses } from '@commerce/contracts';

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
import { readParam } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Catalog' };

const PAGE_SIZE = 20;

export default async function CatalogPage({
  searchParams,
}: PageProps<'/catalog'>) {
  await requireAdmin();
  const params = await searchParams;

  const page = Number(readParam(params, 'page') ?? '1');
  const search = readParam(params, 'search');
  const status = readParam(params, 'status');

  let products;
  try {
    products = await backendListProducts(apiClient);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Catalog"
          description="Products, variants, offers, and prices."
        />
        <ApiErrorNotice error={error} />
        <p className="text-muted-foreground max-w-2xl text-sm text-pretty">
          The admin product listing fails with a server error whenever any
          product has media attached — the response includes the media asset,
          whose <code className="font-mono">byteSize</code> is a{' '}
          <code className="font-mono">BigInt</code> that cannot be serialised to
          JSON. The public catalog read is unaffected because it maps media to a
          smaller shape.
        </p>
      </div>
    );
  }

  // The admin listing takes no query parameters and returns everything, so
  // searching and paging happen here rather than on the server.
  const matching = products.filter(
    (product) =>
      (search === undefined ||
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        product.slug.toLowerCase().includes(search.toLowerCase())) &&
      (status === undefined || product.status === status),
  );

  const total = matching.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(
    Math.max(Number.isInteger(page) ? page : 1, 1),
    totalPages,
  );
  const visible = matching.slice(
    (current - 1) * PAGE_SIZE,
    current * PAGE_SIZE,
  );
  const isFiltered = Boolean(search ?? status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description="Products are platform-owned. A product reaches the storefront only once it, its variant, and its offer are all published."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/catalog/submissions">Seller submissions</Link>
            </Button>
            <Button asChild>
              <Link href="/catalog/new">
                <Plus data-icon="inline-start" />
                New product
              </Link>
            </Button>
          </div>
        }
      />

      <form className="flex flex-wrap items-end gap-2" action="/catalog">
        <div className="min-w-48 flex-1">
          <label htmlFor="catalog-search" className="sr-only">
            Search products
          </label>
          <Input
            id="catalog-search"
            name="search"
            type="search"
            placeholder="Search by name"
            defaultValue={search ?? ''}
          />
        </div>
        <label htmlFor="catalog-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="catalog-status"
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
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/catalog">Clear</Link>
          </Button>
        ) : null}
      </form>

      {visible.length === 0 ? (
        <EmptyState
          title={isFiltered ? 'No matching products' : 'No products yet'}
          description={
            isFiltered
              ? 'No product matches these filters.'
              : 'Create the first product, then give it a variant and a price.'
          }
          action={
            <Button asChild>
              <Link href={isFiltered ? '/catalog' : '/catalog/new'}>
                {isFiltered ? 'Clear filters' : 'New product'}
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
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Variants</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/catalog/${product.id}`}
                      className="font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    <p className="text-muted-foreground font-mono text-xs">
                      {product.slug}
                    </p>
                  </TableCell>
                  <TableCell>{product.brand?.name ?? '—'}</TableCell>
                  <TableCell>{product.category?.name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {product.variants.length}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={product.status.toLowerCase()} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/catalog"
        params={params}
        page={current}
        pageSize={PAGE_SIZE}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
}
