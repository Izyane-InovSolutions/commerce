import type { Metadata } from 'next';
import Link from 'next/link';

import { backendListSellerProducts } from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
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
import { getSellerAccount } from '@/lib/seller';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'My submissions' };

const TITLE = 'My submissions';
const DESCRIPTION =
  'Brand-new products you’ve submitted, and where each one stands with review.';

export default async function ProductSubmissionsPage() {
  await requireUser();
  const account = await getSellerAccount();

  if (account.state !== 'approved') {
    return (
      <SellerGateNotice title={TITLE} description={DESCRIPTION} account={account} />
    );
  }

  let products;
  try {
    products = await backendListSellerProducts(apiClient);
  } catch (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        <ApiErrorNotice error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        action={
          <Button asChild size="sm">
            <Link href="/products/submit">Submit a product</Link>
          </Button>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          title="Nothing submitted yet"
          description="Submit a brand-new product for admin review to see it here."
          action={
            <Button asChild>
              <Link href="/products/submit">Submit a product</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Review status</TableHead>
                <TableHead>Catalog status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/products/submissions/${product.id}`}
                      className="font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    <p className="text-muted-foreground font-mono text-xs">
                      {product.slug}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={product.submissionStatus.toLowerCase()} />
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
    </div>
  );
}
