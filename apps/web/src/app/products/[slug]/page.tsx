import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/back-button';
import { OtherSellers } from '@/components/other-sellers';
import { ProductCard } from '@/components/product-card';
import { ProductDetailActions } from '@/components/product-detail-actions';
import { ProductGallery } from '@/components/product-gallery';
import { Stars } from '@/components/rating-breakdown';
import { RecordProductView } from '@/components/record-product-view';
import { ReviewsSection } from '@/components/reviews-section';
import { StoreCard } from '@/components/store-card';
import { VariantPicker } from '@/components/variant-picker';
import { addToCartAction } from '@/app/cart/actions';
import { addToWishlistAction } from '@/app/wishlist/actions';
import {
  getProductBySlug,
  listProductReviews,
  listProducts,
  listVariantOffers,
  getStorefront,
} from '@/lib/catalog';
import {
  buildOtherOffers,
  DEFAULT_RETURN_WINDOW_DAYS,
  getOrderedMedia,
  getPrimaryImage,
  selectVariant,
  type Product,
  type StorefrontOffer,
  getOfferSale,
} from '@/lib/catalog-types';
import { formatMinor } from '@/lib/currency';
import { readCurrency } from '@/lib/currency-cookie';
import {
  hrefWithSearch,
  parseReviewParams,
  reviewSearchEntries,
  type ReviewParams,
} from '@/lib/review-query';

type ProductDetailPageProps = PageProps<'/products/[slug]'>;

const REVIEW_PAGE_SIZE = 10;
/** Enough to list every seller of a variant in one go; the comparison is a
 * short list in practice, not something to page through. */
const OFFER_COMPARISON_LIMIT = 50;
const REVIEW_PREFIX = 'review';

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  return { title: product?.name ?? 'Product' };
}

/** The variant's full offer comparison, or null when it can't be read —
 * the "Other sellers" list then falls back to the product's own offers. */
async function readVariantOffers(
  variantId: string,
): Promise<StorefrontOffer[] | null> {
  try {
    const page = await listVariantOffers(variantId, {
      limit: OFFER_COMPARISON_LIMIT,
    });
    return page.items;
  } catch {
    return null;
  }
}

async function readRelatedProducts(product: Product): Promise<Product[]> {
  if (!product.category) {
    return [];
  }

  try {
    const { products } = await listProducts({
      categorySlug: product.category.slug,
      limit: 5,
    });
    return products
      .filter((candidate) => candidate.slug !== product.slug)
      .slice(0, 4);
  } catch {
    // A nice-to-have under the product itself — not worth failing the page.
    return [];
  }
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const search = await searchParams;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const requestedVariant =
    typeof search.variant === 'string' ? search.variant : undefined;
  const selection = selectVariant(product, requestedVariant);
  const variant = selection?.variant ?? null;
  const offer = selection?.offer ?? null;
  const price = offer?.currentPrice ?? null;
  const sale = offer ? getOfferSale(offer) : null;
  // The store's rating for the card; a store page that can't be read just
  // leaves the card without it.
  const storefront = offer?.seller?.storefrontSlug
    ? await getStorefront(offer.seller.storefrontSlug).catch(() => null)
    : null;
  const shippingCost = offer?.shippingCost ?? null;
  const inStock = offer?.inStock ?? true;
  const reviewParams = parseReviewParams(search, REVIEW_PREFIX);

  const [currency, comparison, relatedProducts, reviews] = await Promise.all([
    readCurrency(),
    variant ? readVariantOffers(variant.id) : Promise.resolve(null),
    readRelatedProducts(product),
    listProductReviews(product.slug, {
      page: reviewParams.page,
      limit: REVIEW_PAGE_SIZE,
      sort: reviewParams.sort,
      rating: reviewParams.rating,
    }).then(
      (page) =>
        ({
          ok: true,
          reviews: page.data,
          total: page.meta.total,
        }) as const,
      (error: unknown) => ({ ok: false, error }) as const,
    ),
  ]);

  const otherOffers = variant
    ? buildOtherOffers(variant, comparison, offer?.id ?? null)
    : [];
  const primaryImage = getPrimaryImage(product);
  // Review links keep the chosen variant, so paging reviews doesn't reset
  // the buy box.
  const reviewHref = (review: ReviewParams) =>
    hrefWithSearch(`/products/${product.slug}`, {
      variant: requestedVariant,
      ...reviewSearchEntries(review, REVIEW_PREFIX),
    });

  return (
    <div className="space-y-12">
      <RecordProductView
        id={product.id}
        slug={product.slug}
        name={product.name}
        imageUrl={primaryImage?.url ?? null}
        priceAmount={price?.amount ?? null}
        priceCurrency={price?.currency ?? null}
        categorySlug={product.category?.slug ?? null}
      />
      <BackButton />

      <div className="grid gap-8 sm:grid-cols-2">
        <ProductGallery media={getOrderedMedia(product)} alt={product.name} />

        <div className="space-y-4">
          <div className="space-y-1">
            {product.category || product.brand ? (
              <p className="text-sm text-muted-foreground">
                {[product.brand?.name, product.category?.name]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {product.name}
            </h1>
            {product.averageRating != null && product.ratingCount ? (
              <a
                href="#reviews"
                className="text-muted-foreground flex items-center gap-1.5 text-sm hover:underline"
              >
                <Stars rating={product.averageRating} />
                {product.averageRating.toFixed(1)} ({product.ratingCount}{' '}
                {product.ratingCount === 1 ? 'review' : 'reviews'})
              </a>
            ) : null}
          </div>

          <StoreCard offer={offer} storefront={storefront} />

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-semibold">
                {price !== null
                  ? formatMinor(price.amount, price.currency)
                  : `Not sold in ${currency}`}
                {sale ? (
                  <span className="text-muted-foreground ml-2 text-base font-normal line-through">
                    <span className="sr-only">was </span>
                    {formatMinor(sale.was.amount, sale.was.currency)}
                  </span>
                ) : null}
              </p>
              {sale ? (
                <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Save {sale.percentOff}%
                </span>
              ) : null}
              {price !== null && !inStock ? (
                <span className="inline-flex items-center rounded-full bg-destructive/90 px-2.5 py-0.5 text-xs font-medium text-white">
                  Out of stock
                </span>
              ) : null}
            </div>
            {sale?.endsAt ? (
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Sale price until{' '}
                {new Intl.DateTimeFormat('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: 'Africa/Lusaka',
                }).format(new Date(sale.endsAt))}
              </p>
            ) : null}
            {price !== null && shippingCost !== null ? (
              <p className="text-muted-foreground text-sm">
                {shippingCost.amount === 0
                  ? 'Free shipping'
                  : `+ ${formatMinor(shippingCost.amount, shippingCost.currency)} shipping`}
              </p>
            ) : null}
            {product.isReturnable !== undefined ? (
              <p className="text-muted-foreground text-sm">
                {product.isReturnable
                  ? `Returnable within ${product.returnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS} days of delivery.`
                  : 'This item can’t be returned.'}{' '}
                <Link href="/help#returns" className="underline">
                  Returns policy
                </Link>
              </p>
            ) : null}
          </div>

          {variant ? (
            <VariantPicker
              slug={product.slug}
              variants={product.variants}
              selectedId={variant.id}
            />
          ) : null}

          {product.description ? (
            <p className="text-muted-foreground text-pretty">
              {product.description}
            </p>
          ) : null}

          <ProductDetailActions
            // Remounted per offer, so a quantity or "added" notice from one
            // variant doesn't carry over to another.
            key={offer?.id ?? 'unavailable'}
            name={product.name}
            slug={product.slug}
            available={offer !== null}
            inStock={inStock}
            canBuyNow={offer !== null}
            variantId={variant?.id}
            addToCart={addToCartAction.bind(null, offer?.id ?? '')}
            addToWishlist={addToWishlistAction.bind(null, offer?.id ?? '')}
          />
        </div>
      </div>

      <OtherSellers offers={otherOffers} addToCart={addToCartAction} />

      <ReviewsSection
        id="reviews"
        title="Customer reviews"
        summary={{
          averageRating: product.averageRating ?? null,
          ratingCount: product.ratingCount ?? 0,
          histogram: product.ratingHistogram ?? {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0,
          },
        }}
        params={reviewParams}
        result={reviews}
        pageSize={REVIEW_PAGE_SIZE}
        hrefFor={reviewHref}
        emptyMessage={
          reviewParams.rating
            ? `No ${reviewParams.rating}-star reviews.`
            : 'No reviews yet.'
        }
      />

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
