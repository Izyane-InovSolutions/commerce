import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ApiError,
  getProduct,
  listBrands,
  listCategories,
  listInventory,
} from '@commerce/api-client';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { PageHeader } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';
import { StatusBadge } from '@/components/status-badge';
import { StockAdjuster } from '@/components/stock-adjuster';
import { SubmitDraft } from '@/components/submit-draft';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireSeller } from '@/lib/session';

import {
  adjustStockAction,
  submitDraftAction,
  updateProductAction,
} from '../actions';

export async function generateMetadata({
  params,
}: PageProps<'/products/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    return { title: (await getProduct(apiClient, id)).name };
  } catch {
    return { title: 'Product' };
  }
}

export default async function SellerProductPage({
  params,
}: PageProps<'/products/[id]'>) {
  const user = await requireSeller();
  const { id } = await params;

  let product;
  let brands;
  let categories;
  let stock;
  try {
    [product, brands, categories, stock] = await Promise.all([
      getProduct(apiClient, id),
      listBrands(apiClient),
      listCategories(apiClient),
      listInventory(apiClient, { pageSize: 100 }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return <ApiErrorNotice error={error} />;
  }

  if (product.submittedBySellerId !== user.sellerId) {
    notFound();
  }

  const editable = ['draft', 'pending', 'rejected'].includes(product.status);
  const myStock = stock.items.filter((level) => level.productId === product.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title={product.name}
        description={
          editable
            ? 'Your submission. Edits to a rejected product send it back for review.'
            : 'This product is live, so the platform manages the record now. Your price and stock are still yours.'
        }
        action={<StatusBadge status={product.status} />}
      />

      {product.status === 'rejected' && product.rejectionReason ? (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 max-w-2xl space-y-1 rounded-xl border px-4 py-3"
        >
          <p className="text-destructive text-sm font-medium">
            An administrator turned this down.
          </p>
          <p className="text-sm">{product.rejectionReason}</p>
          <p className="text-muted-foreground text-sm">
            Address it below and resubmit.
          </p>
        </div>
      ) : null}

      {product.status === 'draft' ? (
        <SubmitDraft action={submitDraftAction.bind(null, product.id)} />
      ) : null}

      {editable ? (
        <ProductForm
          action={updateProductAction.bind(null, product.id)}
          brands={brands}
          categories={categories}
          product={product}
        />
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Live product</CardTitle>
            <CardDescription>
              Ask an administrator to change the product record. To stop selling
              it, deactivate your offer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/products">Back to products</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your stock</CardTitle>
          <CardDescription>
            What you hold yourself. Available is on hand less what is reserved
            against open orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {myStock.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stock records yet. They open once the product has SKUs.
            </p>
          ) : (
            myStock.map((level) => (
              <div
                key={`${level.skuId}-${level.locationId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="font-mono text-xs">{level.skuCode}</p>
                  <p className="text-sm">
                    <span className="font-medium">{level.available}</span>{' '}
                    available
                    <span className="text-muted-foreground">
                      {' '}
                      · {level.onHand} on hand · {level.reserved} reserved
                    </span>
                  </p>
                </div>
                <StockAdjuster
                  skuId={level.skuId}
                  locationId={level.locationId}
                  label={`${level.skuCode} stock`}
                  action={adjustStockAction}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
