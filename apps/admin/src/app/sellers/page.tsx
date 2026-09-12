import type { Metadata } from 'next';
import Link from 'next/link';

import { backendListSellers } from '@commerce/api-client';
import {
  backendSellerStatuses,
  type BackendSellerStatus,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SelectField } from '@/components/select-field';
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
import { readParam } from '@/lib/search-params';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Sellers' };

const PAGE_SIZE = 20;

function isStatus(value: string): value is BackendSellerStatus {
  return (backendSellerStatuses as readonly string[]).includes(value);
}

export default async function SellersPage({
  searchParams,
}: PageProps<'/sellers'>) {
  await requireAdmin();
  const params = await searchParams;

  const requested = Number(readParam(params, 'page') ?? '1');
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const statusParam = readParam(params, 'status');
  const status =
    statusParam !== undefined && isStatus(statusParam)
      ? statusParam
      : undefined;

  // Unlike the catalog, this endpoint pages and filters server-side, so the
  // query goes to the API rather than being applied to a full listing here.
  let sellers;
  try {
    sellers = await backendListSellers(apiClient, {
      page,
      limit: PAGE_SIZE,
      status,
    });
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Sellers"
          description="Applications, approvals, and standing."
        />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(sellers.total / sellers.limit));
  const isFiltered = status !== undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sellers"
        description="A seller applies, is reviewed here, and can sell only once approved. Suspending one leaves their offers in place but stops new orders reaching them."
      />

      <form className="flex flex-wrap items-end gap-2" action="/sellers">
        <label htmlFor="seller-status" className="sr-only">
          Status
        </label>
        <SelectField
          id="seller-status"
          name="status"
          placeholder="Any status"
          defaultValue={status ?? ''}
          options={backendSellerStatuses.map((value) => ({
            value,
            label: value.charAt(0) + value.slice(1).toLowerCase(),
          }))}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button variant="ghost" asChild>
            <Link href="/sellers">Clear</Link>
          </Button>
        ) : null}
      </form>

      {sellers.items.length === 0 ? (
        <EmptyState
          title={isFiltered ? 'No sellers with that status' : 'No sellers yet'}
          description={
            isFiltered
              ? 'No seller is currently in this state.'
              : 'Sellers appear here once they apply through the storefront.'
          }
          action={
            isFiltered ? (
              <Button asChild>
                <Link href="/sellers">Clear filter</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellers.items.map((seller) => (
                <TableRow key={seller.id}>
                  <TableCell>
                    <Link
                      href={`/sellers/${seller.id}`}
                      className="font-medium hover:underline"
                    >
                      {seller.businessName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(seller.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={seller.status.toLowerCase()} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        pathname="/sellers"
        params={params}
        page={sellers.page}
        pageSize={sellers.limit}
        total={sellers.total}
        totalPages={totalPages}
      />
    </div>
  );
}
