/**
 * Local mirror of `services/commerce-api`'s public catalog shapes.
 *
 * Every response is wrapped in `{ data, meta }`. The product *list* route
 * nests an extra pagination layer inside that (`data.data` / `data.meta`),
 * while categories and a single product do not — see
 * `services/commerce-api/src/modules/products/products.service.ts`.
 */
export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  position: number;
};

export type ProductOffer = {
  id: string;
  status: string;
  /** Null for the platform's own offer — who else's storefront this is,
   * otherwise. Optional only because existing fixtures predate this field;
   * the API always sends it. Not yet shown on any page. */
  seller?: {
    id: string;
    storefrontSlug: string | null;
    displayName: string | null;
    description: string | null;
  } | null;
  isFirstParty?: boolean;
  /**
   * `amount` is in the currency's minor units. Null when the offer carries no
   * price in the currency being browsed — which is not the same as having no
   * price at all; `currencies` says which ones it does have.
   */
  currentPrice: { amount: number; currency: string } | null;
  currencies: string[];
  /** False once available stock (on-hand minus reserved) has run out. */
  inStock: boolean;
  /**
   * A flat, informational shipping cost — separate from the dynamic
   * per-destination quote computed at checkout. Null until an admin sets one.
   */
  shippingCost: { amount: number; currency: string } | null;
};

export type ProductVariant = {
  id: string;
  skuCode: string;
  name: string | null;
  offers: ProductOffer[];
};

/**
 * An image on a product.
 *
 * `url` is signed by the API and relative to its origin — which this app
 * proxies under the same path (see `next.config.ts`), so it can be used as a
 * `src` unchanged.
 */
export type ProductMedia = {
  id: string;
  mediaAssetId: string;
  position: number;
  isPrimary: boolean;
  mimeType: string;
  url: string;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: Category | null;
  media: ProductMedia[];
  variants: ProductVariant[];
};

export type SuccessEnvelope<T> = {
  data: T;
  meta: { requestId: string };
};

export type ProductListPage = {
  data: Product[];
  meta: { page: number; limit: number; total: number };
};

/**
 * The product's display price — amount in minor units, with its currency —
 * from its first variant's first priced offer. Null when the product carries
 * no price in the currency being browsed, which every page treats as "not
 * available in this currency" rather than as a zero price.
 *
 * Deliberately kept in this types-only module rather than `catalog.ts`: it's
 * a pure function used by client components (e.g. `ProductCard`), and
 * `catalog.ts` pulls in the server-only `apiClient` (via `next/headers`),
 * which cannot be part of a client bundle.
 */
export function getDisplayPrice(
  product: Product,
): { amount: number; currency: string } | null {
  return getPrimaryOffer(product)?.currentPrice ?? null;
}

/**
 * The flat shipping cost shown alongside the display price, from the same
 * offer. Null when that offer has none set, which every page treats as
 * nothing to show rather than as free shipping.
 */
export function getShippingCost(
  product: Product,
): { amount: number; currency: string } | null {
  return getPrimaryOffer(product)?.shippingCost ?? null;
}

/**
 * False once the offer a shopper would actually buy has run out of stock.
 * True when the product carries no sellable offer at all — that case is
 * "unavailable", not "out of stock", and every page already tells those
 * apart via `getPrimaryOffer` returning null.
 */
export function isInStock(product: Product): boolean {
  return getPrimaryOffer(product)?.inStock ?? true;
}

/**
 * Currencies this product is priced in but is not being shown in.
 *
 * Lets a listing say "sold in ZMW" rather than "currently unavailable" when
 * the only thing missing is a price in the currency being browsed.
 */
export function getOtherCurrencies(
  product: Product,
  currency: string,
): string[] {
  const found = new Set<string>();

  for (const variant of product.variants) {
    for (const offer of variant.offers) {
      for (const code of offer.currencies) {
        if (code !== currency) {
          found.add(code);
        }
      }
    }
  }

  return [...found].sort();
}

/**
 * The offer a shopper actually buys when they add this product to the cart.
 *
 * The cart is keyed by offer, not by product, so adding anything to it means
 * choosing one — and with no variant picker yet that choice is the first
 * variant's first priced offer, the same one the displayed price comes from.
 * Null when nothing on the product is currently sellable.
 */
export function getPrimaryOffer(product: Product): ProductOffer | null {
  for (const variant of product.variants) {
    const offer = variant.offers.find((candidate) => candidate.currentPrice);
    if (offer) {
      return offer;
    }
  }

  return null;
}

/**
 * The image to lead with: whichever is marked primary, else the first by
 * position. Null when the product has no image yet, which every surface
 * renders as a placeholder rather than a gap.
 */
export function getPrimaryImage(product: Product): ProductMedia | null {
  if (product.media.length === 0) {
    return null;
  }

  const ordered = [...product.media].sort(
    (left, right) => left.position - right.position,
  );
  return ordered.find((image) => image.isPrimary) ?? ordered[0] ?? null;
}
