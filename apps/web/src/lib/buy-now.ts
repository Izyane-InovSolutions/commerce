import {
  getPrimaryOffer,
  getVariantLabel,
  getVariantOffer,
  type Product,
  type ProductOffer,
  type ProductVariant,
} from './catalog-types';

export type BuyNowSelection = {
  variant: ProductVariant;
  offer: ProductOffer;
  price: { amount: number; currency: string };
  /** The product's name, plus the variant's when there is more than one to
   * tell apart — what the order summary calls the thing being bought. */
  name: string;
};

/**
 * What a "buy now" link buys: the chosen variant's lead offer — the same one
 * the product page's price and "Add to cart" describe (`getVariantOffer`) —
 * or, with no variant named, the product's lead offer.
 *
 * Unlike `selectVariant`, a variant id that matches nothing is not quietly
 * swapped for another one: this is about to charge someone, so a stale or
 * made-up id reads as "not available" rather than buying a different
 * variant. Null too when the variant has no priced offer.
 */
export function resolveBuyNowSelection(
  product: Product,
  variantId: string | undefined,
): BuyNowSelection | null {
  let variant: ProductVariant | undefined;
  let offer: ProductOffer | null;

  if (variantId) {
    variant = product.variants.find((candidate) => candidate.id === variantId);
    offer = variant ? getVariantOffer(variant) : null;
  } else {
    offer = getPrimaryOffer(product);
    variant = product.variants.find((candidate) =>
      candidate.offers.some((entry) => entry.id === offer?.id),
    );
  }

  if (!variant || !offer?.currentPrice) {
    return null;
  }

  return {
    variant,
    offer,
    price: offer.currentPrice,
    name:
      product.variants.length > 1
        ? `${product.name} — ${getVariantLabel(variant)}`
        : product.name,
  };
}

/** The buy-now page for a product, at a quantity and — when one is chosen —
 * a variant. */
export function buyNowHref(
  slug: string,
  quantity: number,
  variantId?: string | null,
): string {
  const query = new URLSearchParams({ quantity: String(quantity) });
  if (variantId) {
    query.set('variant', variantId);
  }
  return `/buy-now/${slug}?${query.toString()}`;
}
