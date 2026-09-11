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
  /** `amount` is minor units (ngwee); null when the variant has no first-party offer yet. */
  currentPrice: { amount: number; currency: string } | null;
};

export type ProductVariant = {
  id: string;
  skuCode: string;
  name: string | null;
  offers: ProductOffer[];
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: Category | null;
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
 * The product's display price, in whole Kwacha (not ngwee), from its first
 * variant's first first-party offer. Null when nothing is currently sellable
 * — every product/variant page treats that as "unavailable", not a $0 price.
 *
 * Deliberately kept in this types-only module rather than `catalog.ts`: it's
 * a pure function used by client components (e.g. `ProductCard`), and
 * `catalog.ts` pulls in the server-only `apiClient` (via `next/headers`),
 * which cannot be part of a client bundle.
 */
export function getDisplayPrice(product: Product): number | null {
  const amount = getPrimaryOffer(product)?.currentPrice?.amount;
  return typeof amount === 'number' ? amount / 100 : null;
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
