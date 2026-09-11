import type {
  AdminInsights,
  Buyability,
  BuyabilityReason,
  Contribution,
  OfferDepth,
  PricePosition,
  SellerInsights,
  StockPosition,
} from '@commerce/contracts';

import { requireRole, requireSellerScope } from './auth.ts';
import { db } from './store.ts';
import type { Route } from './types.ts';

/**
 * Derived dashboard figures.
 *
 * Computed on the server so a dashboard is one request rather than a client
 * fetching every list and joining them itself. Nothing here is a trend: there
 * is no orders domain and no time dimension, so a chart shaped like one would
 * be invented rather than measured.
 */

function approvedSellerIds(): Set<string> {
  return new Set(
    db()
      .sellers.filter((seller) => seller.status === 'approved')
      .map((seller) => seller.id),
  );
}

/** Whether an offer has stock at a location it could actually ship from. */
function hasShippableStock(offer: {
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

function sellerInsights(sellerId: string): SellerInsights {
  const approved = approvedSellerIds();

  const stock: StockPosition[] = db()
    .inventory.filter((level) => level.locationSellerId === sellerId)
    .map((level) => ({
      skuId: level.skuId,
      skuCode: level.skuCode,
      productName: level.productName,
      available: level.available,
      reorderThreshold: level.reorderThreshold,
      delta: level.available - level.reorderThreshold,
    }))
    // Worst shortfall first: that is the row the seller has to act on.
    .sort((left, right) => left.delta - right.delta);

  const prices: PricePosition[] = db()
    .offers.filter(
      (offer) => offer.sellerId === sellerId && offer.status === 'active',
    )
    .map((offer) => {
      const rivals = db().offers.filter(
        (candidate) =>
          candidate.skuId === offer.skuId &&
          candidate.status === 'active' &&
          approved.has(candidate.sellerId),
      );
      const best = Math.min(
        ...rivals.map((candidate) => candidate.price.amountMinor),
      );

      return {
        skuId: offer.skuId,
        skuCode: offer.skuCode,
        productName: offer.productName,
        yourPrice: offer.price,
        bestPrice: { amountMinor: best, currency: offer.price.currency },
        competitors: rivals.filter(
          (candidate) => candidate.sellerId !== sellerId,
        ).length,
        isBest: offer.price.amountMinor === best,
      };
    })
    // Biggest gap to the best price first.
    .sort(
      (left, right) =>
        right.yourPrice.amountMinor -
        right.bestPrice.amountMinor -
        (left.yourPrice.amountMinor - left.bestPrice.amountMinor),
    );

  return { stock, prices };
}

function adminInsights(): AdminInsights {
  const approved = approvedSellerIds();
  const activeProducts = db().products.filter(
    (product) => product.status === 'active',
  );

  // Keyed by the reason union, so every bucket is known to exist.
  const counts: Record<BuyabilityReason, number> = {
    onSale: 0,
    noOffer: 0,
    outOfStock: 0,
    sellerSuspended: 0,
  };

  for (const product of activeProducts) {
    const skuIds = new Set(product.variants.map((variant) => variant.sku.id));
    const offers = db().offers.filter(
      (offer) => skuIds.has(offer.skuId) && offer.status === 'active',
    );
    const fromApproved = offers.filter((offer) => approved.has(offer.sellerId));

    // Evaluated in order, one bucket per product, so the four always sum to
    // the number of active products.
    if (fromApproved.some(hasShippableStock)) {
      counts.onSale += 1;
    } else if (offers.length === 0) {
      counts.noOffer += 1;
    } else if (fromApproved.length === 0) {
      counts.sellerSuspended += 1;
    } else {
      counts.outOfStock += 1;
    }
  }

  const buyability: Buyability[] = [
    { reason: 'onSale', products: counts.onSale },
    { reason: 'noOffer', products: counts.noOffer },
    { reason: 'outOfStock', products: counts.outOfStock },
    { reason: 'sellerSuspended', products: counts.sellerSuspended },
  ];

  const bySeller = new Map<string | null, number>();
  for (const product of db().products) {
    const key = product.submittedBySellerId;
    bySeller.set(key, (bySeller.get(key) ?? 0) + 1);
  }

  const contribution: Contribution[] = [...bySeller.entries()]
    .map(([sellerId, products]) => ({
      sellerId,
      sellerName:
        sellerId === null
          ? 'Platform'
          : (db().sellers.find((seller) => seller.id === sellerId)?.name ??
            'Removed seller'),
      products,
    }))
    .sort((left, right) => right.products - left.products);

  const depth = { '1': 0, '2': 0, '3+': 0 };
  for (const product of activeProducts) {
    const skuIds = new Set(product.variants.map((variant) => variant.sku.id));
    const offers = db().offers.filter(
      (offer) =>
        skuIds.has(offer.skuId) &&
        offer.status === 'active' &&
        approved.has(offer.sellerId),
    ).length;

    if (offers === 1) depth['1'] += 1;
    else if (offers === 2) depth['2'] += 1;
    else if (offers >= 3) depth['3+'] += 1;
  }

  const offerDepth: OfferDepth[] = [
    { bucket: '1', products: depth['1'] },
    { bucket: '2', products: depth['2'] },
    { bucket: '3+', products: depth['3+'] },
  ];

  return {
    buyability,
    contribution,
    offerDepth,
    queue: {
      applicationsPending: db().applications.filter(
        (application) => application.status === 'pending',
      ).length,
      productsPending: db().products.filter(
        (product) => product.status === 'pending',
      ).length,
    },
    totals: {
      activeSellers: db().sellers.filter(
        (seller) => seller.status === 'approved',
      ).length,
      suspendedSellers: db().sellers.filter(
        (seller) => seller.status === 'suspended',
      ).length,
      activeProducts: activeProducts.length,
      productsOnSale: counts.onSale,
    },
  };
}

export const insightRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/seller/insights',
    auth: 'authenticated',
    handle: ({ url, user }) =>
      sellerInsights(
        requireSellerScope(user, url.searchParams.get('sellerId') ?? undefined),
      ),
  },

  {
    method: 'GET',
    pattern: '/admin/insights',
    auth: ['admin'],
    handle: ({ user }) => {
      requireRole(user, 'admin');
      return adminInsights();
    },
  },
];
