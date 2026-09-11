import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { listBrands, listCategories, listProducts } from '@commerce/api-client';
import { productListQuerySchema, productStatuses } from '@commerce/contracts';

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
import { requireAdmin } from '@/lib/session';
import { parseQueryParams } from '@/lib/query';

export const metadata: Metadata = { title: 'Catalog' };

export default async function CatalogPage({
  searchParams,
}: PageProps<'/catalog'>) {
  await requireAdmin();
  const params = await searchParams;
  const query = parseQueryParams(productListQuerySchema, params);

  let result;
  let brands;
  let categories;
  try {
    [result, brands, categories] = await Promise.all([
      listProducts(apiClient, query),
      listBrands(apiClient),
      listCategories(apiClient),
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Catalog"
          description="Products are owned by the platform. Sellers list offers against these SKUs."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));
  const categoryName = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const isFiltered = Boolean(
    query.q ?? query.status ?? query.brandId ?? query.categoryId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description="Products are owned by the platform. Sellers list offers against these SKUs."
        action={
          <Button asChild>
            <Link href="/catalog/new">
              <Plus data-icon="inline-start" />
              New product
            </Link>
          </Button>
        }
      />

      <form className="flex flex-wrap items-end gap-2" action="/catalog">
        <div className="min-w-48 flex-1">
          <label htmlFor="catalog-q" className="sr-only">
            Search products
          </label>
          <Input
            id="catalog-q"
            name="q"
            type="search"
            placeholder="Search name or SKU code"
            defaultValue={query.q ?? ''}
          />
        </div>
        <label htmlFor="catalog-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="catalog-status"
          name="status"
          placeholder="Any status"
          defaultValue={query.status ?? ''}
          options={productStatuses.map((status) => ({
            value: status,
            label: status.charAt(0).toUpperCase() + status.slice(1),
          }))}
        />
        <label htmlFor="catalog-brand" className="sr-only">
          Brand
        </label>
        <SelectField
          id="catalog-brand"
          name="brandId"
          placeholder="Any brand"
          defaultValue={query.brandId ?? ''}
          options={brands.map((brand) => ({
            value: brand.id,
            label: brand.name,
          }))}
        />
        <label htmlFor="catalog-category" className="sr-only">
          Category
        </label>
        <SelectField
          id="catalog-category"
          name="categoryId"
          placeholder="Any category"
          defaultValue={query.categoryId ?? ''}
          options={categories.map((category) => ({
            value: category.id,
            label: category.name,
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

      {result.items.length === 0 ? (
        <EmptyState
          title={isFiltered ? 'No matching products' : 'No products yet'}
          description={
            isFiltered
              ? 'No product matches these filters. Try widening the search.'
              : 'Create the first product so sellers have something to offer against.'
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
              {result.items.map((product) => (
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
                  <TableCell>
                    {product.brandId
                      ? (brandName.get(product.brandId) ?? '—')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {product.categoryId
                      ? (categoryName.get(product.categoryId) ?? '—')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {product.variants.length}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={product.status} />
                    {product.submittedBySellerName ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        from {product.submittedBySellerName}
                      </p>
                    ) : null}
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
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </div>
  );
}
