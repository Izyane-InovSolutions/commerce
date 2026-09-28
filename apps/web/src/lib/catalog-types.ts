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
  /** On sale: the regular price the current, time-limited price undercuts.
   * Optional (and absent from older APIs); null when not on sale. */
  compareAtPrice?: { amount: number; currency: string } | null;
  /** When the sale price ends (ISO). */
  saleEndsAt?: string | null;
  currencies: string[];
  /** False once available stock (on-hand minus reserved) has run out. */
  inStock: boolean;
  /**
   * A flat, informational shipping cost — separate from the dynamic
   * per-destination quote computed at checkout. Null until an admin sets one.
   */
  shippingCost: { amount: number; currency: string } | null;
};

/** One attribute value a variant carries, e.g. `Colour: Black`. */
export type VariantAttribute = {
  attributeId: string;
  attributeName: string;
  valueId: string;
  value: string;
};

export type ProductVariant = {
  id: string;
  skuCode: string;
  name: string | null;
  /** Optional only because existing fixtures predate it; the API always
   * sends it (empty for a product with a single, unnamed variant). */
  attributes?: VariantAttribute[];
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

export type Brand = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

/** How many published ratings sit at each star value. */
export type RatingHistogram = Record<1 | 2 | 3 | 4 | 5, number>;

/** The API's own fallback when a returnable product sets no window of its
 * own (`DEFAULT_RETURN_WINDOW_DAYS` in its returns module), counted from
 * delivery. */
export const DEFAULT_RETURN_WINDOW_DAYS = 30;

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: Category | null;
  media: ProductMedia[];
  variants: ProductVariant[];
  // The fields below are always sent by the API; they're optional only so
  // the many fixtures that predate them still type-check.
  brand?: Brand | null;
  isReturnable?: boolean;
  /** Null means the platform default applies (see the help page). */
  returnWindowDays?: number | null;
  /** Null when the product has never been reviewed. */
  averageRating?: number | null;
  ratingCount?: number;
  /** Chosen by an admin for the featured shelf (absent from older APIs). */
  isFeatured?: boolean;
  ratingHistogram?: RatingHistogram;
};

export type SuccessEnvelope<T> = {
  data: T;
  meta: { requestId: string };
};

/** A seller's public storefront — `GET /storefronts/:slug`. */
export type Storefront = {
  id: string;
  storefrontSlug: string | null;
  displayName: string | null;
  description: string | null;
  averageRating: number | null;
  ratingCount: number;
  ratingHistogram: RatingHistogram;
};

/**
 * One of a seller's own listings, as `GET /storefronts/:slug/offers`
 * returns it — an offer, not a full `Product`: the same underlying product
 * can be listed by more than one seller, each at their own price and
 * condition, so a storefront page shows this seller's listing of it, never
 * mixed with anyone else's.
 */
export type StorefrontOffer = {
  id: string;
  variantId: string;
  listingTitle: string | null;
  seller: {
    id: string;
    storefrontSlug: string | null;
    displayName: string | null;
    description: string | null;
  } | null;
  isFirstParty: boolean;
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  product: {
    id: string;
    name: string;
    slug: string;
    image: { url: string; mimeType: string } | null;
  };
  currentPrice: { amount: number; currency: string } | null;
  currencies: string[];
};

/** This endpoint pages flat (`{items, total, page, limit}`), not nested
 * under `data`/`meta` like the product list — see `ProductListPage`.
 * `GET /catalog/variants/:id/offers` pages its offers the same way, and in
 * the same shape. */
export type StorefrontOfferPage = {
  items: StorefrontOffer[];
  total: number;
  page: number;
  limit: number;
};

/** The nested `{ data, meta }` page the product list, product reviews and
 * storefront ratings all return (inside the usual envelope). */
export type NestedPage<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number };
};

export type ProductListPage = NestedPage<Product>;

/** A published product review — `GET /catalog/products/:slug/reviews`. */
export type ProductReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  /** Already shortened by the API (e.g. "Jane D."), never a full name. */
  reviewerLabel: string;
  verifiedPurchase: true;
  createdAt: string;
  updatedAt: string;
  seller: { id: string; displayName: string | null } | null;
};

/** A published seller rating — `GET /storefronts/:slug/ratings`. */
export type SellerRating = {
  id: string;
  rating: number;
  comment: string | null;
  reviewerLabel: string;
  verifiedPurchase: true;
  createdAt: string;
  updatedAt: string;
};

/** The sort vocabulary both review lists accept (see the API's
 * `review-sort.ts`) — a fixed set, not the generic `field:dir` form. */
export const REVIEW_SORTS = ['newest', 'oldest', 'highest', 'lowest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

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
 * The offer a listing leads with — and what "Buy it now" buys.
 *
 * The cart is keyed by offer, not by product, so adding anything to it means
 * choosing one. Cards and the buy-now flow have no variant picker, so theirs
 * is the first variant's first priced offer, the same one the displayed price
 * comes from; the product page lets a shopper choose otherwise (see
 * `selectVariant`). Null when nothing on the product is currently sellable.
 */
export function getPrimaryOffer(product: Product): ProductOffer | null {
  for (const variant of product.variants) {
    const offer = getVariantOffer(variant);
    if (offer) {
      return offer;
    }
  }

  return null;
}

/** A variant's lead offer: its first priced one, in the API's order — the
 * same rule `getPrimaryOffer` applies across the whole product. */
export function getVariantOffer(variant: ProductVariant): ProductOffer | null {
  return variant.offers.find((candidate) => candidate.currentPrice) ?? null;
}

/**
 * The variant the product page is showing, and the offer it would sell.
 *
 * `requestedId` comes from the URL, so it may be stale or made up: anything
 * that doesn't match one of the product's variants falls back to whichever
 * variant `getPrimaryOffer` would pick, so an unadorned product link shows
 * the same price the card it came from did. Null only for a product with no
 * variants at all.
 */
export function selectVariant(
  product: Product,
  requestedId: string | undefined,
): { variant: ProductVariant; offer: ProductOffer | null } | null {
  const requested = requestedId
    ? product.variants.find((variant) => variant.id === requestedId)
    : undefined;
  const variant =
    requested ??
    product.variants.find((candidate) => getVariantOffer(candidate)) ??
    product.variants[0];

  return variant ? { variant, offer: getVariantOffer(variant) } : null;
}

/**
 * What a shopper sees on a variant's picker button: its own name, else its
 * attribute values ("Black / Large"), else its SKU — every variant has one,
 * so two can never render as the same blank button.
 */
export function getVariantLabel(variant: ProductVariant): string {
  if (variant.name) {
    return variant.name;
  }

  const values = (variant.attributes ?? []).map((entry) => entry.value);
  return values.length > 0 ? values.join(' / ') : variant.skuCode;
}

/**
 * The media in display order — primary first, then by position — for the
 * product page's gallery. `getPrimaryImage` is always the first entry.
 */
export function getOrderedMedia(product: Product): ProductMedia[] {
  return [...product.media].sort(
    (left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary) ||
      left.position - right.position,
  );
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

/**
 * One line of the product page's "Other sellers" list.
 *
 * Built from two reads that each know half of it: the variant-offers
 * comparison (`StorefrontOffer`) knows each listing's condition and title,
 * while the product itself knows stock and flat shipping per offer.
 */
export type OtherOffer = {
  id: string;
  seller: ProductOffer['seller'];
  isFirstParty: boolean;
  /** Null when only the product's own offer list could be read. */
  condition: StorefrontOffer['condition'] | null;
  listingTitle: string | null;
  price: { amount: number; currency: string };
  shippingCost: { amount: number; currency: string } | null;
  inStock: boolean;
};

/**
 * Every other priced offer for the selected variant, cheapest first.
 *
 * `comparison` is null when `GET /catalog/variants/:id/offers` couldn't be
 * read; the product's own offers for the variant stand in then, just without
 * condition or listing title. The offer already in the buy box is left out —
 * it's the one the main price and "Add to cart" already describe.
 */
export function buildOtherOffers(
  variant: ProductVariant,
  comparison: StorefrontOffer[] | null,
  selectedOfferId: string | null,
): OtherOffer[] {
  const known = new Map(variant.offers.map((offer) => [offer.id, offer]));
  const rows: OtherOffer[] = [];

  if (comparison) {
    for (const entry of comparison) {
      if (entry.id === selectedOfferId || !entry.currentPrice) continue;
      // Only what the product read also lists: that read is what knows
      // stock, and an offer it doesn't carry can't be vouched for.
      const offer = known.get(entry.id);
      if (!offer) continue;
      rows.push({
        id: entry.id,
        seller: entry.seller ?? offer.seller ?? null,
        isFirstParty: entry.isFirstParty,
        condition: entry.condition,
        listingTitle: entry.listingTitle,
        price: entry.currentPrice,
        shippingCost: offer.shippingCost,
        inStock: offer.inStock,
      });
    }
  } else {
    for (const offer of variant.offers) {
      if (offer.id === selectedOfferId || !offer.currentPrice) continue;
      rows.push({
        id: offer.id,
        seller: offer.seller ?? null,
        isFirstParty: offer.isFirstParty ?? !offer.seller,
        condition: null,
        listingTitle: null,
        price: offer.currentPrice,
        shippingCost: offer.shippingCost,
        inStock: offer.inStock,
      });
    }
  }

  return rows.sort((left, right) => left.price.amount - right.price.amount);
}

/** A price drop on one offer, as the storefront shows it. */
export type Sale = {
  offer: ProductOffer;
  price: { amount: number; currency: string };
  was: { amount: number; currency: string };
  /** Whole percent, rounded down so it never overstates the saving. */
  percentOff: number;
  endsAt: string | null;
};

/** The offer's sale, if its current price undercuts a regular one. */
export function getOfferSale(offer: ProductOffer): Sale | null {
  const price = offer.currentPrice;
  const was = offer.compareAtPrice ?? null;
  if (!price || !was || was.currency !== price.currency) return null;
  if (was.amount <= price.amount) return null;
  return {
    offer,
    price,
    was,
    percentOff: Math.floor((1 - price.amount / was.amount) * 100),
    endsAt: offer.saleEndsAt ?? null,
  };
}

/** The sale on the offer a card shows (see getPrimaryOffer). */
export function getDisplaySale(product: Product): Sale | null {
  const offer = getPrimaryOffer(product);
  return offer ? getOfferSale(offer) : null;
}

/** The product's biggest in-stock saving across every variant, for deal
 * shelves — the discounted variant needn't be the one a card leads with. */
export function getBestSale(product: Product): Sale | null {
  let best: Sale | null = null;
  for (const variant of product.variants) {
    for (const offer of variant.offers) {
      const sale = offer.inStock ? getOfferSale(offer) : null;
      if (sale && (!best || sale.percentOff > best.percentOff)) best = sale;
    }
  }
  return best;
}
