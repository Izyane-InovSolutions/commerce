import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ApiError,
  getProduct,
  listBrands,
  listCategories,
  listInventory,
  listOffers,
} from '@commerce/api-client';
import { formatMoney } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';
import { ProductModeration } from '@/components/product-moderation';
import { StatusBadge } from '@/components/status-badge';
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
import { requireAdmin } from '@/lib/session';

import {
  approveProductAction,
  rejectProductAction,
  resolveProposalAction,
  updateProductAction,
} from '../actions';

export async function generateMetadata({
  params,
}: PageProps<'/catalog/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    const product = await getProduct(apiClient, id);
    return { title: product.name };
  } catch {
    return { title: 'Product' };
  }
}

export default async function ProductPage({
  params,
}: PageProps<'/catalog/[id]'>) {
  await requireAdmin();
  const { id } = await params;

  let product;
  let brands;
  let categories;
  let offers;
  let stock;
  try {
    [product, brands, categories, offers, stock] = await Promise.all([
      getProduct(apiClient, id),
      listBrands(apiClient),
      listCategories(apiClient),
      listOffers(apiClient, { pageSize: 100 }),
      listInventory(apiClient, { pageSize: 100 }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return <ApiErrorNotice error={error} />;
  }

  const productOffers = offers.items.filter(
    (offer) => offer.productId === product.id,
  );
  const productStock = stock.items.filter(
    (level) => level.productId === product.id,
  );

  const updateAction = updateProductAction.bind(null, product.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title={product.name}
        description="Edit the product and its variants. Offers and stock below are read-only here."
        action={<StatusBadge status={product.status} />}
      />

      <ProductModeration
        product={product}
        brands={brands}
        categories={categories}
        approve={approveProductAction.bind(null, product.id)}
        reject={rejectProductAction.bind(null, product.id)}
        resolveBrand={resolveProposalAction.bind(null, product.id, 'brand')}
        resolveCategory={resolveProposalAction.bind(
          null,
          product.id,
          'category',
        )}
      />

      {product.status === 'rejected' && product.rejectionReason ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
          Rejected: {product.rejectionReason}
        </p>
      ) : null}

      <ProductForm
        action={updateAction}
        brands={brands}
        categories={categories}
        product={product}
      />

      <Card>
        <CardHeader>
          <CardTitle>Offers</CardTitle>
          <CardDescription>
            Sellers listing against this product&apos;s SKUs. Sellers manage
            these in the seller portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {productOffers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No seller has listed an offer against this product yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seller</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productOffers.map((offer) => (
                    <TableRow key={offer.id}>
                      <TableCell>{offer.sellerName}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {offer.skuCode}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(offer.price)}
                      </TableCell>
                      <TableCell>{offer.condition}</TableCell>
                      <TableCell>
                        <StatusBadge status={offer.status} />
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
          <CardTitle>Stock</CardTitle>
          <CardDescription>
            Available is derived by the API as on-hand less reserved. Adjust it
            from{' '}
            <Link href="/inventory" className="underline">
              Inventory
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {productStock.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stock records for this product.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productStock.map((level) => (
                    <TableRow key={`${level.skuId}-${level.locationId}`}>
                      <TableCell className="font-mono text-xs">
                        {level.skuCode}
                      </TableCell>
                      <TableCell>{level.locationName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {level.onHand}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {level.reserved}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {level.available}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
