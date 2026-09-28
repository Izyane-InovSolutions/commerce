import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ApiError,
  backendGetProduct,
  backendGetCategoryAttributes,
  backendListAttributes,
  backendListBrands,
  backendListCategories,
} from '@commerce/api-client';
import {
  currentPrices,
  type BackendAdminOffer,
  type BackendPrice,
} from '@commerce/contracts';

import { ApiErrorNotice } from '@/components/api-error-notice';
import type { AttributeChoice } from '@/components/attribute-value-picker';
import { DeleteControl } from '@/components/delete-control';
import { FulfillmentActionButton } from '@/components/fulfillment-action-button';
import { OfferControls } from '@/components/offer-controls';
import { PageHeader } from '@/components/page-header';
import { ProductForm } from '@/components/product-form';
import { ProductImages } from '@/components/product-images';
import { StatusBadge } from '@/components/status-badge';
import { StatusControl } from '@/components/status-control';
import { VariantAddForm } from '@/components/variant-add-form';
import { VariantEditForm } from '@/components/variant-edit-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { requireAdmin } from '@/lib/session';

import {
  addPriceAction,
  addVariantAction,
  createOfferAction,
  deleteOfferAction,
  deleteProductAction,
  deleteVariantAction,
  setOfferShippingAction,
  setFeaturedAction,
  setOfferStatusAction,
  setStatusAction,
  updateProductAction,
  updateVariantAction,
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

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "From 3 Sep 2026", or "3 Sep 2026 – 30 Sep 2026" once it has an end. */
function priceWindow(price: BackendPrice): string {
  return price.endsAt === null
    ? `From ${formatDay(price.startsAt)}`
    : `${formatDay(price.startsAt)} – ${formatDay(price.endsAt)}`;
}

/** Every price the offer has carried, newest first, marking those in force. */
function priceHistory(offer: BackendAdminOffer) {
  const inForce = new Set(currentPrices(offer.prices).map((price) => price.id));

  return [...offer.prices]
    .sort(
      (left, right) =>
        new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime(),
    )
    .map((price) => ({
      id: price.id,
      price: formatMinor(price.amount, price.currency),
      window: priceWindow(price),
      current: inForce.has(price.id),
    }));
}

/** Where the variant pickers' options come from, and how to change them. */
function VariantOptionsNote({
  source,
  category,
}: {
  source: 'category' | 'none' | 'uncategorised' | 'legacy';
  category: { id: string; name: string } | null;
}) {
  if (source === 'legacy') return null;

  const manage = category ? (
    <Link
      href={`/categories/${category.id}`}
      className="font-medium underline underline-offset-4"
    >
      {source === 'category'
        ? 'Change them'
        : `Attach attributes to ${category.name}`}
    </Link>
  ) : null;

  return (
    <p className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
      {source === 'category' && category ? (
        <>
          Options come from {category.name}&apos;s attributes. {manage}.
        </>
      ) : source === 'none' && category ? (
        <>
          {category.name} has no attributes yet, so variants are told apart by
          SKU and name only. {manage} — for example Size or Colour — to offer
          them as options here and on the storefront.
        </>
      ) : (
        <>
          Choose a category in the details above to pick variant options from
          its attributes.
        </>
      )}
    </p>
  );
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

  // Attributes only feed the variant pickers, so failing to read them costs
  // the pickers rather than the page. Null (not empty) tells the edit form to
  // leave a variant's values untouched instead of clearing them.
  //
  // A category with attributes attached (its own or inherited) decides which
  // pickers show, in its order, with required ones marked — the API holds
  // variants to exactly that. Otherwise every catalog attribute is offered.
  // Variant pickers show only what the product's category is described by
  // (its own attributes and its parents'), in its order, required ones
  // marked — the same rules the API holds variants to. A category with none
  // attached offers none, rather than every attribute in the catalog (a
  // drink would otherwise be offered "Carrier"); the card says how to add
  // some. Only an API from before category attributes (404) still gets the
  // whole list, since it has no rules to follow.
  let attributes: AttributeChoice[] | null;
  let attributeSource: 'category' | 'none' | 'uncategorised' | 'legacy' =
    'uncategorised';
  try {
    if (!product.category) {
      attributes = [];
    } else {
      const fromCategory = await backendGetCategoryAttributes(
        apiClient,
        product.category.id,
      ).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      });
      if (fromCategory === null) {
        attributeSource = 'legacy';
        attributes = (await backendListAttributes(apiClient)).map(
          (attribute) => ({
            id: attribute.id,
            name: attribute.name,
            values: [...attribute.values].sort((left, right) =>
              left.value.localeCompare(right.value),
            ),
          }),
        );
      } else {
        attributeSource = fromCategory.length > 0 ? 'category' : 'none';
        attributes = fromCategory.map((attribute) => ({
          id: attribute.attributeId,
          name: attribute.name,
          isRequired: attribute.isRequired,
          values: attribute.values,
        }));
      }
    }
  } catch {
    attributes = null;
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
        <CardContent className="space-y-4">
          <StatusControl
            current={product.status}
            label="product"
            action={setStatusAction.bind(null, {
              kind: 'product',
              productId: product.id,
              id: product.id,
            })}
          />
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <p className="text-sm">
              {product.featuredAt
                ? 'Featured on the storefront.'
                : 'Not featured on the storefront.'}
            </p>
            <FulfillmentActionButton
              action={setFeaturedAction.bind(
                null,
                product.id,
                !product.featuredAt,
              )}
              label={product.featuredAt ? 'Remove from featured' : 'Feature it'}
              pendingLabel="Saving…"
              variant="outline"
            />
          </div>
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
          <VariantOptionsNote
            source={attributeSource}
            category={product.category}
          />
          {product.variants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No variants yet. Add one below to be able to price this product.
            </p>
          ) : (
            product.variants.map((variant) => (
              <div key={variant.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    {/* `||`, not `??`: a cleared name is stored empty. */}
                    <p className="font-medium">
                      {variant.name || variant.skuCode}
                    </p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {variant.skuCode}
                    </p>
                    {variant.attributeValues.length > 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {variant.attributeValues
                          .map(
                            (entry) =>
                              `${entry.attributeValue.attribute.name}: ${entry.attributeValue.value}`,
                          )
                          .join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-start gap-3">
                    <StatusControl
                      current={variant.status}
                      label={variant.skuCode}
                      action={setStatusAction.bind(null, {
                        kind: 'variant',
                        productId: product.id,
                        id: variant.id,
                      })}
                    />
                    <DeleteControl
                      action={deleteVariantAction.bind(
                        null,
                        product.id,
                        variant.id,
                      )}
                      label="Delete"
                      confirmLabel={variant.skuCode}
                    />
                  </div>
                </div>

                <VariantEditForm
                  variant={{
                    id: variant.id,
                    skuCode: variant.skuCode,
                    name: variant.name,
                    attributeValueIds: variant.attributeValues.map(
                      (entry) => entry.attributeValueId,
                    ),
                  }}
                  attributes={attributes}
                  action={updateVariantAction.bind(
                    null,
                    product.id,
                    variant.id,
                  )}
                />

                <OfferControls
                  productId={product.id}
                  variantId={variant.id}
                  variantLabel={variant.skuCode}
                  offers={variant.offers.map((offer) => ({
                    id: offer.id,
                    status: offer.status,
                    // The admin read returns the whole price history, and an
                    // offer can be priced in several currencies at once, so
                    // every one currently in force is listed rather than
                    // whichever was added last.
                    prices: currentPrices(offer.prices)
                      .sort((left, right) =>
                        left.currency.localeCompare(right.currency),
                      )
                      .map((price) =>
                        formatMinor(price.amount, price.currency),
                      ),
                    shipping:
                      offer.shippingAmount !== null &&
                      offer.shippingCurrency !== null
                        ? formatMinor(
                            offer.shippingAmount,
                            offer.shippingCurrency,
                          )
                        : null,
                    sellerOwned: offer.sellerId !== null,
                    history: priceHistory(offer),
                    remove:
                      offer.sellerId === null
                        ? deleteOfferAction.bind(null, product.id, offer.id)
                        : undefined,
                  }))}
                  createOffer={createOfferAction.bind(
                    null,
                    product.id,
                    variant.id,
                  )}
                  addPrice={addPriceAction.bind(null, product.id)}
                  setOfferStatus={setOfferStatusAction.bind(null, product.id)}
                  setOfferShipping={setOfferShippingAction.bind(
                    null,
                    product.id,
                  )}
                />
              </div>
            ))
          )}

          <VariantAddForm
            action={addVariantAction.bind(null, product.id)}
            attributes={attributes ?? undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete product</CardTitle>
          <CardDescription>
            Removes the product with its variants, offers and images. Only
            possible before anything has sold or been stocked; after that,
            archive it instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteControl
            action={deleteProductAction.bind(null, product.id)}
            label="Delete product"
            confirmLabel="this product"
          />
        </CardContent>
      </Card>
    </div>
  );
}
