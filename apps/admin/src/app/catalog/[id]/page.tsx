import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  ApiError,
  backendGetProduct,
  backendListBrands,
  backendListCategories,
} from '@commerce/api-client';

import { pickCurrentPrice } from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import { OfferControls } from '@/components/offer-controls';
import { PageHeader } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';
import { ProductImages } from '@/components/product-images';
import { StatusBadge } from '@/components/status-badge';
import { StatusControl } from '@/components/status-control';
import { VariantAddForm } from '@/components/variant-add-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

import {
  addPriceAction,
  addVariantAction,
  createOfferAction,
  setOfferStatusAction,
  setStatusAction,
  updateProductAction,
} from '../actions';
import {
  removeProductImageAction,
  setPrimaryImageAction,
  uploadProductImageAction,
} from '../media-actions';

export async function generateMetadata({
  params,
}: PageProps<'/catalog/[id]'>): Promise<Metadata> {
  const { id } = await params;
  try {
    return { title: (await backendGetProduct(apiClient, id)).name };
  } catch {
    return { title: 'Product' };
  }
}

function formatMinor(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

export default async function ProductPage({
  params,
}: PageProps<'/catalog/[id]'>) {
  await requireAdmin();
  const { id } = await params;

  let product;
  let brands;
  let categories;
  try {
    [product, brands, categories] = await Promise.all([
      backendGetProduct(apiClient, id),
      backendListBrands(apiClient),
      backendListCategories(apiClient),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return <ApiErrorNotice error={error} />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={product.name}
        description="A product is buyable only when it, its variant, and its offer are all published."
        action={<StatusBadge status={product.status.toLowerCase()} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Publishing the product is the first of the three gates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusControl
            current={product.status}
            label="product"
            action={setStatusAction.bind(null, {
              kind: 'product',
              productId: product.id,
              id: product.id,
            })}
          />
        </CardContent>
      </Card>

      <ProductForm
        action={updateProductAction.bind(null, product.id)}
        brands={brands}
        categories={categories}
        product={product}
      />

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>
            The primary image is the one the storefront leads with. JPEG, PNG,
            and WebP up to 10MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductImages
            media={product.media}
            upload={uploadProductImageAction.bind(null, product.id)}
            setPrimary={setPrimaryImageAction.bind(null, product.id)}
            remove={removeProductImageAction.bind(null, product.id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variants and pricing</CardTitle>
          <CardDescription>
            Each variant carries a SKU. An offer holds the price, and a
            published offer is what makes the variant buyable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {product.variants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No variants yet. Add one below to be able to price this product.
            </p>
          ) : (
            product.variants.map((variant) => (
              <div key={variant.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {variant.name ?? variant.skuCode}
                    </p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {variant.skuCode}
                    </p>
                  </div>
                  <StatusControl
                    current={variant.status}
                    label={variant.skuCode}
                    action={setStatusAction.bind(null, {
                      kind: 'variant',
                      productId: product.id,
                      id: variant.id,
                    })}
                  />
                </div>

                <OfferControls
                  productId={product.id}
                  variantId={variant.id}
                  variantLabel={variant.skuCode}
                  offers={variant.offers.map((offer) => {
                    // The admin read returns the whole price history, so the
                    // one in force is resolved the same way the API does.
                    const price = pickCurrentPrice(offer.prices);
                    return {
                      id: offer.id,
                      status: offer.status,
                      price: price
                        ? formatMinor(price.amount, price.currency)
                        : null,
                    };
                  })}
                  createOffer={createOfferAction.bind(
                    null,
                    product.id,
                    variant.id,
                  )}
                  addPrice={addPriceAction.bind(null, product.id)}
                  setOfferStatus={setOfferStatusAction.bind(null, product.id)}
                />
              </div>
            ))
          )}

          <VariantAddForm action={addVariantAction.bind(null, product.id)} />
        </CardContent>
      </Card>
    </div>
  );
}
