import {
  adjustInventorySchema,
  createOfferSchema,
  createProductSchema,
  rejectSchema,
  resolveProposalSchema,
  sellerCatalogQuerySchema,
  submitProductSchema,
  updateSellerProductSchema,
  inventoryListQuerySchema,
  offerListQuerySchema,
  parseMoneyInput,
  productListQuerySchema,
  skuListQuerySchema,
  updateOfferSchema,
  updateProductSchema,
  type InventoryLevel,
  type Offer,
  type Product,
  type SellerProductRow,
  type SkuSummary,
  type User,
} from '@commerce/contracts';

import {
  requireRole,
  requireSellerScope,
  requireUser,
  userFromRequest,
} from './auth.ts';
import {
  MockHttpError,
  errorResponse,
  matches,
  paginate,
  parseBody,
  parseQuery,
} from './http.ts';
import { id } from './id.ts';
import { authRoutes } from './routes-auth.ts';
import { insightRoutes } from './routes-insights.ts';
import { storefrontRoutes } from './routes-storefront.ts';
import { taxonomyRoutes } from './routes-taxonomy.ts';
import { db } from './store.ts';
import type { Route } from './types.ts';

function nowIso(): string {
  return new Date().toISOString();
}

function findProduct(productId: string): Product {
  const product = db().products.find((candidate) => candidate.id === productId);
  if (!product) {
    throw new MockHttpError(404, `No product with id ${productId}.`);
  }
  return product;
}

function findOffer(offerId: string): Offer {
  const offer = db().offers.find((candidate) => candidate.id === offerId);
  if (!offer) {
    throw new MockHttpError(404, `No offer with id ${offerId}.`);
  }
  return offer;
}

/**
 * Settles a proposed brand or category on one product.
 *
 * The decision belongs to the product review rather than a queue of its own:
 * the admin already has the product in front of them, and a proposal only
 * makes sense in the context of what it is for.
 */
function resolveProposal(
  product: Product,
  axis: 'brand' | 'category',
  body: unknown,
): Product {
  const input = parseBody(resolveProposalSchema, body);
  const store = db();

  if (input.action === 'attach') {
    const exists =
      axis === 'brand'
        ? store.brands.some((brand) => brand.id === input.id)
        : store.categories.some((category) => category.id === input.id);
    if (!exists) {
      throw new MockHttpError(404, `No ${axis} with id ${input.id}.`);
    }

    if (axis === 'brand') {
      product.brandId = input.id;
    } else {
      product.categoryId = input.id;
    }
  }

  if (input.action === 'create') {
    if (axis === 'brand') {
      if (store.brands.some((brand) => brand.slug === input.slug)) {
        throw new MockHttpError(
          409,
          `The slug ${input.slug} is already in use.`,
        );
      }
      const brandId = id(`brand:${input.slug}`);
      store.brands.push({
        id: brandId,
        name: input.name,
        slug: input.slug,
        productCount: 0,
      });
      product.brandId = brandId;
    } else {
      if (store.categories.some((category) => category.slug === input.slug)) {
        throw new MockHttpError(
          409,
          `The slug ${input.slug} is already in use.`,
        );
      }
      if (
        input.parentId !== null &&
        !store.categories.some((category) => category.id === input.parentId)
      ) {
        throw new MockHttpError(404, `No category with id ${input.parentId}.`);
      }
      const categoryId = id(`category:${input.slug}`);
      store.categories.push({
        id: categoryId,
        name: input.name,
        slug: input.slug,
        parentId: input.parentId,
        productCount: 0,
      });
      product.categoryId = categoryId;
    }
  }

  // Dismissing leaves the product without one, which is a valid outcome.
  if (axis === 'brand') {
    product.proposedBrandName = null;
  } else {
    product.proposedCategoryName = null;
  }

  product.updatedAt = nowIso();
  return product;
}

/**
 * One of a seller's own submissions.
 *
 * A product belonging to someone else reads as absent rather than forbidden,
 * so the API does not confirm what another seller has in the pipeline. Live
 * and archived products are off limits too: once published the platform owns
 * the record.
 */
function findSellerProduct(productId: string, sellerId: string): Product {
  const product = db().products.find(
    (candidate) =>
      candidate.id === productId && candidate.submittedBySellerId === sellerId,
  );
  if (!product) {
    throw new MockHttpError(404, `No product with id ${productId}.`);
  }

  if (!['draft', 'pending', 'rejected'].includes(product.status)) {
    throw new MockHttpError(
      409,
      'This product is live, so it is managed by the platform now. Ask an administrator to change it.',
    );
  }

  return product;
}

/**
 * Everything one seller sells, flattened to a row per SKU.
 *
 * Covers SKUs they submitted and SKUs they merely offer against, because both
 * are things they sell — and joins in their price and their own stock, which
 * is how a seller thinks about a listing.
 */
function sellerCatalogRows(sellerId: string): SellerProductRow[] {
  const offers = db().offers.filter((offer) => offer.sellerId === sellerId);
  const offerBySku = new Map(offers.map((offer) => [offer.skuId, offer]));
  const stockBySku = new Map(
    db()
      .inventory.filter((level) => level.locationSellerId === sellerId)
      .map((level) => [level.skuId, level]),
  );

  const products = db().products.filter(
    (product) =>
      product.submittedBySellerId === sellerId ||
      product.variants.some((variant) => offerBySku.has(variant.sku.id)),
  );

  return products
    .flatMap((product) =>
      product.variants.map((variant) => {
        const offer = offerBySku.get(variant.sku.id) ?? null;
        const stock = stockBySku.get(variant.sku.id) ?? null;

        return {
          skuId: variant.sku.id,
          skuCode: variant.sku.code,
          variantName: variant.name,
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          productStatus: product.status,
          rejectionReason: product.rejectionReason,
          submittedByMe: product.submittedBySellerId === sellerId,
          offerId: offer?.id ?? null,
          price: offer?.price ?? null,
          offerStatus: offer?.status ?? null,
          onHand: stock?.onHand ?? null,
          reserved: stock?.reserved ?? null,
          available: stock?.available ?? null,
          locationId: stock?.locationId ?? null,
        } satisfies SellerProductRow;
      }),
    )
    .sort(
      (left, right) =>
        left.productName.localeCompare(right.productName) ||
        left.skuCode.localeCompare(right.skuCode),
    );
}

/** A seller may only reach their own offers; an admin may reach any. */
function requireOfferAccess(offer: Offer, user: User | null): Offer {
  const authenticated = requireUser(user);
  if (
    !authenticated.roles.includes('admin') &&
    offer.sellerId !== authenticated.sellerId
  ) {
    throw new MockHttpError(404, `No offer with id ${offer.id}.`);
  }
  return offer;
}

function skuSummaries(): SkuSummary[] {
  const brands = new Map(db().brands.map((brand) => [brand.id, brand.name]));

  return db().products.flatMap((product) =>
    product.variants.map((variant) => ({
      skuId: variant.sku.id,
      skuCode: variant.sku.code,
      productId: product.id,
      productName: product.name,
      variantName: variant.name,
      brandName: product.brandId ? (brands.get(product.brandId) ?? null) : null,
    })),
  );
}

/** Rebuilds the variants of a product, preserving ids for unchanged SKUs. */
function buildVariants(
  productId: string,
  inputs: {
    name: string;
    skuCode: string;
    attributes: Record<string, string>;
  }[],
): Product['variants'] {
  const seen = new Set<string>();

  return inputs.map((input) => {
    if (seen.has(input.skuCode)) {
      throw new MockHttpError(
        409,
        `SKU code ${input.skuCode} is used twice in this product.`,
      );
    }
    seen.add(input.skuCode);

    const variantId = id(`variant:${input.skuCode}`);
    return {
      id: variantId,
      productId,
      name: input.name,
      attributes: input.attributes,
      sku: {
        id: id(`sku:${input.skuCode}`),
        variantId,
        code: input.skuCode,
      },
    };
  });
}

function assertSlugAvailable(slug: string, exceptProductId?: string): void {
  const clash = db().products.find(
    (product) => product.slug === slug && product.id !== exceptProductId,
  );
  if (clash) {
    throw new MockHttpError(409, `Slug ${slug} is already used.`);
  }
}

function offerFromSku(skuId: string): {
  productId: string;
  productName: string;
  variantName: string;
  skuCode: string;
} {
  const summary = skuSummaries().find((sku) => sku.skuId === skuId);
  if (!summary) {
    throw new MockHttpError(404, `No SKU with id ${skuId}.`);
  }

  return {
    productId: summary.productId,
    productName: summary.productName,
    variantName: summary.variantName,
    skuCode: summary.skuCode,
  };
}

function requirePrice(value: string): ReturnType<typeof parseMoneyInput> {
  const parsed = parseMoneyInput(value);
  if (!parsed) {
    throw new MockHttpError(400, 'price: Enter an amount such as 12.50.');
  }
  return parsed;
}

const routes: Route[] = [
  {
    method: 'GET',
    pattern: '/health',
    auth: 'public',
    // `mock` marks this as the stand-in API; the real one omits it.
    handle: () => ({ status: 'ok', mock: true }),
  },

  {
    method: 'GET',
    pattern: '/locations',
    auth: 'authenticated',
    handle: ({ user }) => {
      const authenticated = requireUser(user);
      if (authenticated.roles.includes('admin')) {
        return db().locations;
      }
      return db().locations.filter(
        (location) => location.sellerId === authenticated.sellerId,
      );
    },
  },

  {
    method: 'GET',
    pattern: '/skus',
    auth: 'authenticated',
    handle: ({ url }) => {
      const query = parseQuery(skuListQuerySchema, url);
      const filtered = skuSummaries().filter(
        (sku) =>
          matches(sku.skuCode, query.q) ||
          matches(sku.productName, query.q) ||
          matches(sku.variantName, query.q),
      );

      return paginate(filtered, query.page, query.pageSize);
    },
  },

  {
    method: 'GET',
    pattern: '/products',
    auth: 'authenticated',
    handle: ({ url, user }) => {
      const query = parseQuery(productListQuerySchema, url);
      const authenticated = requireUser(user);
      const isAdmin = authenticated.roles.includes('admin');

      const filtered = db()
        .products.filter(
          (product) =>
            (isAdmin ||
              product.status === 'active' ||
              product.submittedBySellerId === authenticated.sellerId) &&
            (query.submittedBySellerId === undefined ||
              product.submittedBySellerId === query.submittedBySellerId) &&
            (matches(product.name, query.q) ||
              matches(product.slug, query.q) ||
              product.variants.some((variant) =>
                matches(variant.sku.code, query.q),
              )) &&
            (query.status === undefined || product.status === query.status) &&
            (query.brandId === undefined ||
              product.brandId === query.brandId) &&
            (query.categoryId === undefined ||
              product.categoryId === query.categoryId),
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      return paginate(filtered, query.page, query.pageSize);
    },
  },

  {
    method: 'POST',
    pattern: '/products',
    auth: ['admin'],
    handle: ({ body }) => {
      const input = parseBody(createProductSchema, body);
      assertSlugAvailable(input.slug);

      const productId = id(`product:${input.slug}`);
      const product: Product = {
        id: productId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        status: input.status,
        brandId: input.brandId,
        categoryId: input.categoryId,
        proposedBrandName: null,
        proposedCategoryName: null,
        submittedBySellerId: null,
        submittedBySellerName: null,
        rejectionReason: null,
        variants: buildVariants(productId, input.variants),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      db().products.push(product);
      seedInventoryFor(product);
      return product;
    },
  },

  {
    method: 'GET',
    pattern: '/products/:id',
    auth: 'authenticated',
    handle: ({ params }) => findProduct(params.id!),
  },

  {
    method: 'PATCH',
    pattern: '/products/:id',
    auth: ['admin'],
    handle: ({ params, body }) => {
      const product = findProduct(params.id!);
      const input = parseBody(updateProductSchema, body);

      if (input.slug !== undefined) {
        assertSlugAvailable(input.slug, product.id);
        product.slug = input.slug;
      }
      if (input.name !== undefined) product.name = input.name;
      if (input.description !== undefined)
        product.description = input.description;
      if (input.status !== undefined) product.status = input.status;
      if (input.brandId !== undefined) product.brandId = input.brandId;
      if (input.categoryId !== undefined) product.categoryId = input.categoryId;
      if (input.variants !== undefined) {
        product.variants = buildVariants(product.id, input.variants);
        seedInventoryFor(product);
      }

      product.updatedAt = nowIso();
      return product;
    },
  },

  {
    method: 'GET',
    pattern: '/offers',
    auth: 'authenticated',
    handle: ({ url, user }) => {
      const query = parseQuery(offerListQuerySchema, url);
      const authenticated = requireUser(user);
      // A seller only ever sees their own offers, whatever they ask for.
      const sellerId = authenticated.roles.includes('admin')
        ? query.sellerId
        : (authenticated.sellerId ?? '__none__');

      const filtered = db()
        .offers.filter(
          (offer) =>
            (matches(offer.productName, query.q) ||
              matches(offer.skuCode, query.q) ||
              matches(offer.variantName, query.q)) &&
            (sellerId === undefined || offer.sellerId === sellerId) &&
            (query.skuId === undefined || offer.skuId === query.skuId) &&
            (query.status === undefined || offer.status === query.status),
        )
        .sort((left, right) =>
          left.productName.localeCompare(right.productName),
        );

      return paginate(filtered, query.page, query.pageSize);
    },
  },

  {
    method: 'POST',
    pattern: '/offers',
    auth: 'authenticated',
    handle: ({ body, url, user }) => {
      const input = parseBody(createOfferSchema, body);
      // The seller comes from the session, not the request, so a caller
      // cannot list stock under someone else's account.
      const sellerId = requireSellerScope(
        user,
        url.searchParams.get('sellerId') ?? undefined,
      );
      const seller = db().sellers.find(
        (candidate) => candidate.id === sellerId,
      )!;

      const sku = offerFromSku(input.skuId);
      const duplicate = db().offers.find(
        (offer) => offer.skuId === input.skuId && offer.sellerId === seller.id,
      );
      if (duplicate) {
        throw new MockHttpError(
          409,
          `You already have an offer on SKU ${sku.skuCode}.`,
        );
      }

      const offer: Offer = {
        id: id(`offer:${seller.slug}:${sku.skuCode}:${db().offers.length}`),
        skuId: input.skuId,
        skuCode: sku.skuCode,
        productId: sku.productId,
        productName: sku.productName,
        variantName: sku.variantName,
        sellerId: seller.id,
        sellerName: seller.name,
        price: requirePrice(input.price)!,
        compareAtPrice:
          input.compareAtPrice === ''
            ? null
            : requirePrice(input.compareAtPrice),
        condition: input.condition,
        status: input.status,
        fulfillmentMode: input.fulfillmentMode,
        handlingTimeDays: input.handlingTimeDays,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      db().offers.push(offer);
      // A priced SKU needs somewhere for the seller to record their stock.
      openSellerStock(sellerId, input.skuId);
      return offer;
    },
  },

  {
    method: 'GET',
    pattern: '/offers/:id',
    auth: 'authenticated',
    handle: ({ params, user }) =>
      requireOfferAccess(findOffer(params.id!), user),
  },

  {
    method: 'PATCH',
    pattern: '/offers/:id',
    auth: 'authenticated',
    handle: ({ params, body, user }) => {
      const offer = requireOfferAccess(findOffer(params.id!), user);
      const input = parseBody(updateOfferSchema, body);

      if (input.price !== undefined) offer.price = requirePrice(input.price)!;
      if (input.compareAtPrice !== undefined) {
        offer.compareAtPrice =
          input.compareAtPrice === ''
            ? null
            : requirePrice(input.compareAtPrice);
      }
      if (input.condition !== undefined) offer.condition = input.condition;
      if (input.status !== undefined) offer.status = input.status;
      if (input.fulfillmentMode !== undefined) {
        offer.fulfillmentMode = input.fulfillmentMode;
      }
      if (input.handlingTimeDays !== undefined) {
        offer.handlingTimeDays = input.handlingTimeDays;
      }

      offer.updatedAt = nowIso();
      return offer;
    },
  },

  {
    method: 'POST',
    pattern: '/seller/products',
    auth: 'authenticated',
    handle: ({ body, url, user }) => {
      const sellerId = requireSellerScope(
        user,
        url.searchParams.get('sellerId') ?? undefined,
      );
      const seller = db().sellers.find(
        (candidate) => candidate.id === sellerId,
      )!;
      const input = parseBody(submitProductSchema, body);
      assertSlugAvailable(input.slug);

      const productId = id(`product:${input.slug}`);
      const product: Product = {
        id: productId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        // Draft or awaiting review — a seller cannot publish. Only an admin
        // moves a product to active.
        status: input.status,
        brandId: input.brandId,
        categoryId: input.categoryId,
        proposedBrandName: input.proposedBrandName,
        proposedCategoryName: input.proposedCategoryName,
        submittedBySellerId: sellerId,
        submittedBySellerName: seller.name,
        rejectionReason: null,
        variants: buildVariants(productId, input.variants),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      db().products.push(product);
      seedInventoryFor(product);
      return product;
    },
  },

  {
    method: 'PATCH',
    pattern: '/seller/products/:id',
    auth: 'authenticated',
    handle: ({ params, body, url, user }) => {
      const sellerId = requireSellerScope(
        user,
        url.searchParams.get('sellerId') ?? undefined,
      );
      const product = findSellerProduct(params.id!, sellerId);
      const input = parseBody(updateSellerProductSchema, body);

      if (input.slug !== undefined) {
        assertSlugAvailable(input.slug, product.id);
        product.slug = input.slug;
      }
      if (input.name !== undefined) product.name = input.name;
      if (input.description !== undefined)
        product.description = input.description;
      if (input.brandId !== undefined) {
        product.brandId = input.brandId;
        // Picking an existing entry withdraws any proposal for that axis.
        if (input.brandId !== null) product.proposedBrandName = null;
      }
      if (input.categoryId !== undefined) {
        product.categoryId = input.categoryId;
        if (input.categoryId !== null) product.proposedCategoryName = null;
      }
      if (input.proposedBrandName !== undefined) {
        product.proposedBrandName = input.proposedBrandName;
        if (input.proposedBrandName !== null) product.brandId = null;
      }
      if (input.proposedCategoryName !== undefined) {
        product.proposedCategoryName = input.proposedCategoryName;
        if (input.proposedCategoryName !== null) product.categoryId = null;
      }
      if (input.variants !== undefined) {
        product.variants = buildVariants(product.id, input.variants);
        seedInventoryFor(product);
      }
      if (input.status !== undefined) {
        product.status = input.status;
      } else if (product.status === 'rejected') {
        // Editing a rejected product is how a seller answers the feedback, so
        // it goes back into the queue rather than sitting in limbo.
        product.status = 'pending';
      }

      if (product.status === 'pending') {
        product.rejectionReason = null;
      }

      product.updatedAt = nowIso();
      return product;
    },
  },

  {
    method: 'POST',
    pattern: '/seller/products/:id/submit',
    auth: 'authenticated',
    handle: ({ params, url, user }) => {
      const sellerId = requireSellerScope(
        user,
        url.searchParams.get('sellerId') ?? undefined,
      );
      const product = findSellerProduct(params.id!, sellerId);

      if (product.status === 'pending') {
        throw new MockHttpError(409, 'That product is already under review.');
      }

      product.status = 'pending';
      product.rejectionReason = null;
      product.updatedAt = nowIso();
      return product;
    },
  },

  {
    method: 'GET',
    pattern: '/seller/catalog',
    auth: 'authenticated',
    handle: ({ url, user }) => {
      const sellerId = requireSellerScope(
        user,
        url.searchParams.get('sellerId') ?? undefined,
      );
      const query = parseQuery(sellerCatalogQuerySchema, url);

      const rows = sellerCatalogRows(sellerId).filter(
        (row) =>
          (matches(row.productName, query.q) ||
            matches(row.skuCode, query.q) ||
            matches(row.variantName, query.q)) &&
          (query.view === 'all' || row.productStatus === query.view),
      );

      return paginate(rows, query.page, query.pageSize);
    },
  },

  {
    method: 'POST',
    pattern: '/products/:id/approve',
    auth: ['admin'],
    handle: ({ params }) => {
      const product = findProduct(params.id!);
      if (product.status !== 'pending') {
        throw new MockHttpError(409, 'Only a pending product can be approved.');
      }

      // Publishing with an unsettled proposal would either lose what the
      // seller told us or let unreviewed names reach the storefront, so the
      // decision has to be made as part of the review.
      const unresolved = [
        product.proposedBrandName === null ? null : 'brand',
        product.proposedCategoryName === null ? null : 'category',
      ].filter((axis): axis is string => axis !== null);

      if (unresolved.length > 0) {
        throw new MockHttpError(
          409,
          `Settle the proposed ${unresolved.join(' and ')} before approving.`,
        );
      }

      product.status = 'active';
      product.rejectionReason = null;
      product.updatedAt = nowIso();
      return product;
    },
  },

  {
    method: 'POST',
    pattern: '/products/:id/brand',
    auth: ['admin'],
    handle: ({ params, body }) =>
      resolveProposal(findProduct(params.id!), 'brand', body),
  },

  {
    method: 'POST',
    pattern: '/products/:id/category',
    auth: ['admin'],
    handle: ({ params, body }) =>
      resolveProposal(findProduct(params.id!), 'category', body),
  },

  {
    method: 'POST',
    pattern: '/products/:id/reject',
    auth: ['admin'],
    handle: ({ params, body }) => {
      const product = findProduct(params.id!);
      if (product.status !== 'pending') {
        throw new MockHttpError(409, 'Only a pending product can be rejected.');
      }

      const input = parseBody(rejectSchema, body);
      product.status = 'rejected';
      product.rejectionReason = input.reason;
      product.updatedAt = nowIso();
      return product;
    },
  },

  {
    method: 'GET',
    pattern: '/inventory',
    auth: 'authenticated',
    handle: ({ url, user }) => {
      const query = parseQuery(inventoryListQuerySchema, url);
      const authenticated = requireUser(user);
      const isAdmin = authenticated.roles.includes('admin');
      // A seller sees the stock they hold themselves, never a platform
      // warehouse. An admin may narrow to one seller's holding.
      const heldBy = isAdmin
        ? query.sellerId
        : (authenticated.sellerId ?? '__none__');

      const filtered = db()
        .inventory.filter(
          (level) =>
            (matches(level.skuCode, query.q) ||
              matches(level.productName, query.q) ||
              matches(level.variantName, query.q)) &&
            (query.locationId === undefined ||
              level.locationId === query.locationId) &&
            (query.skuId === undefined || level.skuId === query.skuId) &&
            (heldBy === undefined || level.locationSellerId === heldBy) &&
            (query.belowThreshold !== true ||
              level.available < level.reorderThreshold),
        )
        .sort(
          (left, right) =>
            left.productName.localeCompare(right.productName) ||
            left.skuCode.localeCompare(right.skuCode),
        );

      return paginate(filtered, query.page, query.pageSize);
    },
  },

  {
    method: 'POST',
    pattern: '/inventory/adjustments',
    auth: 'authenticated',
    handle: ({ body, user }) => {
      const authenticated = requireUser(user);
      if (!authenticated.roles.includes('admin')) {
        requireSellerScope(user, undefined);
      }

      const input = parseBody(adjustInventorySchema, body);
      const level = db().inventory.find(
        (candidate) =>
          candidate.skuId === input.skuId &&
          candidate.locationId === input.locationId,
      );
      if (!level) {
        throw new MockHttpError(
          404,
          'No stock record for that SKU and location.',
        );
      }

      // Stock is adjusted by whoever holds it. A seller correcting their own
      // shelf is routine; a seller reaching into a platform warehouse is not,
      // and is reported as absent rather than forbidden.
      if (
        !authenticated.roles.includes('admin') &&
        level.locationSellerId !== authenticated.sellerId
      ) {
        throw new MockHttpError(
          404,
          'No stock record for that SKU and location.',
        );
      }

      const onHand = level.onHand + input.delta;
      if (onHand < 0) {
        throw new MockHttpError(
          409,
          `Adjustment would take on-hand stock below zero (currently ${level.onHand}).`,
        );
      }
      if (onHand < level.reserved) {
        throw new MockHttpError(
          409,
          `Adjustment would leave fewer than the ${level.reserved} reserved units.`,
        );
      }

      level.onHand = onHand;
      // Stock written off as damaged leaves on-hand and lands in the damaged bucket.
      if (input.reason === 'damaged') {
        level.damaged += Math.abs(input.delta);
      }
      level.available = level.onHand - level.reserved;
      level.updatedAt = nowIso();

      return level;
    },
  },
];

/** The SKUs one seller has an offer against. */
function sellerSkuIds(sellerId: string): Set<string> {
  return new Set(
    db()
      .offers.filter((offer) => offer.sellerId === sellerId)
      .map((offer) => offer.skuId),
  );
}

const allRoutes: Route[] = [
  ...routes,
  ...authRoutes,
  ...storefrontRoutes,
  ...taxonomyRoutes,
  ...insightRoutes,
];

/** Rejects a caller that does not satisfy a route's `auth` requirement. */
function enforceAuth(route: Route, user: User | null): void {
  if (route.auth === 'public') {
    return;
  }

  if (route.auth === 'authenticated') {
    requireUser(user);
    return;
  }

  requireUser(user);
  if (!route.auth.some((role) => user!.roles.includes(role))) {
    throw new MockHttpError(
      403,
      `This action needs one of these roles: ${route.auth.join(', ')}.`,
    );
  }
}

/**
 * Opens stock records for a product's SKUs.
 *
 * Records are created only where someone actually holds the stock: a
 * platform-owned product at the platform's fulfilment centres, and a seller's
 * submission at that seller's own location. Creating a row everywhere would
 * multiply empty rows by every seller on the platform.
 */
function seedInventoryFor(product: Product): void {
  const existing = new Set(
    db().inventory.map((level) => `${level.skuId}:${level.locationId}`),
  );

  const locations = db().locations.filter((location) =>
    product.submittedBySellerId === null
      ? location.sellerId === null
      : location.sellerId === product.submittedBySellerId,
  );

  for (const variant of product.variants) {
    for (const location of locations) {
      const key = `${variant.sku.id}:${location.id}`;
      if (existing.has(key)) {
        continue;
      }

      const level: InventoryLevel = {
        skuId: variant.sku.id,
        skuCode: variant.sku.code,
        productId: product.id,
        productName: product.name,
        variantName: variant.name,
        locationId: location.id,
        locationName: location.name,
        locationSellerId: location.sellerId,
        onHand: 0,
        reserved: 0,
        available: 0,
        damaged: 0,
        inTransit: 0,
        reorderThreshold: 0,
        updatedAt: nowIso(),
      };
      db().inventory.push(level);
    }
  }
}

/** Opens a stock record for one SKU at one seller's own location. */
function openSellerStock(sellerId: string, skuId: string): void {
  const location = db().locations.find(
    (candidate) => candidate.sellerId === sellerId,
  );
  if (!location) {
    return;
  }

  const exists = db().inventory.some(
    (level) => level.skuId === skuId && level.locationId === location.id,
  );
  if (exists) {
    return;
  }

  const summary = skuSummaries().find((sku) => sku.skuId === skuId);
  if (!summary) {
    return;
  }

  db().inventory.push({
    skuId,
    skuCode: summary.skuCode,
    productId: summary.productId,
    productName: summary.productName,
    variantName: summary.variantName,
    locationId: location.id,
    locationName: location.name,
    locationSellerId: sellerId,
    onHand: 0,
    reserved: 0,
    available: 0,
    damaged: 0,
    inTransit: 0,
    reorderThreshold: 0,
    updatedAt: nowIso(),
  });
}

function match(
  route: Route,
  method: string,
  segments: string[],
): Record<string, string> | null {
  if (route.method !== method) {
    return null;
  }

  const patternSegments = route.pattern.split('/').filter(Boolean);
  if (patternSegments.length !== segments.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (const [index, patternSegment] of patternSegments.entries()) {
    const segment = segments[index]!;
    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = segment;
    } else if (patternSegment !== segment) {
      return null;
    }
  }

  return params;
}

/**
 * Serves one request against the mock database.
 *
 * `path` is the API path with the mount prefix already removed, so it looks
 * exactly like a path under `/api/v1`.
 */
export async function handleMockRequest(
  request: Request,
  path: string,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = path.split('/').filter(Boolean);

  for (const route of allRoutes) {
    const params = match(route, request.method, segments);
    if (!params) {
      continue;
    }

    try {
      const user = userFromRequest(request);
      enforceAuth(route, user);

      const body =
        request.method === 'GET' || request.method === 'DELETE'
          ? undefined
          : await request.json().catch(() => ({}));

      const result = await route.handle({ params, url, body, request, user });
      // An endpoint serving a non-JSON asset builds its own response.
      if (result instanceof Response) {
        return result;
      }

      const status = request.method === 'POST' ? 201 : 200;
      return Response.json(result, { status });
    } catch (error) {
      if (error instanceof MockHttpError) {
        return errorResponse(error);
      }
      throw error;
    }
  }

  return errorResponse(
    new MockHttpError(404, `Cannot ${request.method} /${segments.join('/')}.`),
  );
}
