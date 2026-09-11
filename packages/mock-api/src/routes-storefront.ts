import {
  storefrontListQuerySchema,
  type Money,
  type StorefrontOffer,
  type StorefrontProduct,
} from '@commerce/contracts';

import { MockHttpError, matches, paginate, parseQuery } from './http.ts';
import { db } from './store.ts';
import type { Route } from './types.ts';

/**
 * Public storefront.
 *
 * Visibility is decided here, once: a product shows if it is active and has at
 * least one active offer from an approved seller. Because the rule lives on
 * the server, no client can accidentally surface a suspended seller's stock.
 */

/**
 * Whether an offer has stock someone could actually ship.
 *
 * Stock is only useful where the offer can be fulfilled from: a seller
 * fulfilling their own orders ships from their own holding, while platform,
 * 3PL and pickup offers ship from a platform fulfilment centre. An offer with
 * no available stock in the right place is not buyable, however active it is.
 */
function hasAvailableStock(offer: {
  skuId: string;
  sellerId: string;
  fulfillmentMode: string;
}): boolean {
  return db().inventory.some(
    (level) =>
      level.skuId === offer.skuId &&
      level.available > 0 &&
      (offer.fulfillmentMode === 'seller'
        ? level.locationSellerId === offer.sellerId
        : level.locationSellerId === null),
  );
}

function buyableOffers(productId: string): StorefrontOffer[] {
  const approved = new Set(
    db()
      .sellers.filter((seller) => seller.status === 'approved')
      .map((seller) => seller.id),
  );

  return db()
    .offers.filter(
      (offer) =>
        offer.productId === productId &&
        offer.status === 'active' &&
        approved.has(offer.sellerId) &&
        hasAvailableStock(offer),
    )
    .map((offer) => ({
      id: offer.id,
      skuId: offer.skuId,
      skuCode: offer.skuCode,
      variantName: offer.variantName,
      sellerId: offer.sellerId,
      sellerName: offer.sellerName,
      price: offer.price,
      compareAtPrice: offer.compareAtPrice,
      condition: offer.condition,
      fulfillmentMode: offer.fulfillmentMode,
      handlingTimeDays: offer.handlingTimeDays,
    }))
    .sort((left, right) => left.price.amountMinor - right.price.amountMinor);
}

function listings(): StorefrontProduct[] {
  const brands = new Map(db().brands.map((brand) => [brand.id, brand.name]));
  const categories = new Map(
    db().categories.map((category) => [category.id, category.name]),
  );

  return db()
    .products.filter((product) => product.status === 'active')
    .flatMap((product) => {
      const offers = buyableOffers(product.id);
      if (offers.length === 0) {
        return [];
      }

      const fromPrice = offers[0]!.price satisfies Money;
      return [
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          brandName: product.brandId
            ? (brands.get(product.brandId) ?? null)
            : null,
          categoryName: product.categoryId
            ? (categories.get(product.categoryId) ?? null)
            : null,
          fromPrice,
          offerCount: offers.length,
          offers,
        },
      ];
    });
}

export const storefrontRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/storefront/products',
    auth: 'public',
    handle: ({ url }) => {
      const query = parseQuery(storefrontListQuerySchema, url);
      const filtered = listings()
        .flatMap((listing) => {
          if (
            !matches(listing.name, query.q) &&
            !matches(listing.description, query.q) &&
            !matches(listing.brandName ?? '', query.q)
          ) {
            return [];
          }

          if (query.condition === undefined) {
            return [listing];
          }

          // Filtering by condition narrows the offers too, so a listing never
          // advertises a "from" price the shopper cannot actually buy.
          const offers = listing.offers.filter(
            (offer) => offer.condition === query.condition,
          );
          return offers.length === 0
            ? []
            : [
                {
                  ...listing,
                  offers,
                  offerCount: offers.length,
                  fromPrice: offers[0]!.price,
                },
              ];
        })
        .filter((listing) => {
          const product = db().products.find(
            (candidate) => candidate.id === listing.id,
          );
          return (
            (query.brandId === undefined ||
              product?.brandId === query.brandId) &&
            (query.categoryId === undefined ||
              product?.categoryId === query.categoryId)
          );
        })
        .sort((left, right) => left.name.localeCompare(right.name));

      return paginate(filtered, query.page, query.pageSize);
    },
  },

  {
    method: 'GET',
    pattern: '/storefront/products/:slug',
    auth: 'public',
    handle: ({ params }) => {
      const listing = listings().find(
        (candidate) => candidate.slug === params.slug,
      );
      if (!listing) {
        throw new MockHttpError(404, 'No product is on sale at that address.');
      }
      return listing;
    },
  },
];
