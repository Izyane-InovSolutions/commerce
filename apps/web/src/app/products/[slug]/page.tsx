import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/back-button';
import { ProductCard } from '@/components/product-card';
import { ProductImage } from '@/components/product-image';
import { ProductDetailActions } from '@/components/product-detail-actions';
import { RecordProductView } from '@/components/record-product-view';
import { addToCartAction } from '@/app/cart/actions';
import { addToWishlistAction } from '@/app/wishlist/actions';
import { getProductBySlug, listProducts } from '@/lib/catalog';
import {
  getDisplayPrice,
  getOtherCurrencies,
  getPrimaryImage,
  getPrimaryOffer,
  getShippingCost,
} from '@/lib/catalog-types';
import { formatMinor } from '@/lib/currency';
import { readCurrency } from '@/lib/currency-cookie';

type ProductDetailPageProps = PageProps<'/products/[slug]'>;

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  return { title: product?.name ?? 'Product' };
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const currency = await readCurrency();
  const price = getDisplayPrice(product);
  const offer = getPrimaryOffer(product);
  const shippingCost = getShippingCost(product);
  const inStock = offer?.inStock ?? true;
  const elsewhere = getOtherCurrencies(product, currency);
  const relatedProducts = product.category
    ? (
        await listProducts({
          categorySlug: product.category.slug,
          limit: 5,
        })
      ).products
        .filter((candidate) => candidate.slug !== product.slug)
        .slice(0, 4)
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-12">
      <RecordProductView
        id={product.id}
        slug={product.slug}
        name={product.name}
        imageUrl={getPrimaryImage(product)?.url ?? null}
        priceAmount={price?.amount ?? null}
        priceCurrency={price?.currency ?? null}
      />
      <BackButton />

      <div className="grid gap-8 sm:grid-cols-2">
        <ProductImage
          src={getPrimaryImage(product)?.url ?? null}
          alt={product.name}
          sizes="(min-width: 640px) 50vw, 100vw"
          className="aspect-square rounded-2xl"
          iconClassName="size-16"
        />

        <div className="space-y-4">
          <div className="space-y-1">
            {product.category ? (
              <p className="text-sm text-muted-foreground">
                {product.category.name}
              </p>
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {product.name}
            </h1>
            {offer?.seller ? (
              offer.seller.storefrontSlug ? (
                <Link
                  href={`/sellers/${offer.seller.storefrontSlug}`}
                  className="text-muted-foreground block text-sm hover:underline"
                >
                  Sold by {offer.seller.displayName ?? 'a marketplace seller'}
                </Link>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Sold by {offer.seller.displayName ?? 'a marketplace seller'}
                </p>
              )
            ) : null}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-semibold">
                {price !== null
                  ? formatMinor(price.amount, price.currency)
                  : `Not sold in ${currency}`}
              </p>
              {price !== null && !inStock ? (
                <span className="inline-flex items-center rounded-full bg-destructive/90 px-2.5 py-0.5 text-xs font-medium text-white">
                  Out of stock
                </span>
              ) : null}
            </div>
            {price !== null && shippingCost !== null ? (
              <p className="text-muted-foreground text-sm">
                {shippingCost.amount === 0
                  ? 'Free shipping'
                  : `+ ${formatMinor(shippingCost.amount, shippingCost.currency)} shipping`}
              </p>
            ) : null}
            {price === null && elsewhere.length > 0 ? (
              <p className="text-muted-foreground text-sm text-pretty">
                Priced in {elsewhere.join(' and ')} — switch currency in the
                header to buy it.
              </p>
            ) : null}
          </div>

          {product.description ? (
            <p className="text-muted-foreground text-pretty">
              {product.description}
            </p>
          ) : null}

          <ProductDetailActions
            name={product.name}
            slug={product.slug}
            available={offer !== null}
            inStock={inStock}
            addToCart={addToCartAction.bind(null, offer?.id ?? '')}
            addToWishlist={addToWishlistAction.bind(null, offer?.id ?? '')}
          />
        </div>
      </div>

      {relatedProducts.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Similar products
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
