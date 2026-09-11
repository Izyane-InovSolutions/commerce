import type {
  Brand,
  Category,
  InventoryLevel,
  InventoryLocation,
  Offer,
  Product,
  Seller,
  SellerApplication,
} from '@commerce/contracts';
import { money } from '@commerce/contracts';

import type { MockUser } from './auth.ts';
import { id } from './id.ts';

const NOW = '2026-01-15T09:00:00.000Z';

type VariantSpec = {
  name: string;
  skuCode: string;
  attributes: Record<string, string>;
};

type ProductSpec = {
  slug: string;
  name: string;
  description: string;
  status: Product['status'];
  brand: string | null;
  category: string | null;
  variants: VariantSpec[];
};

const CATEGORY_SPECS = [
  { slug: 'workspace', name: 'Workspace', parent: null },
  { slug: 'desks', name: 'Desks', parent: 'workspace' },
  { slug: 'seating', name: 'Seating', parent: 'workspace' },
  { slug: 'displays', name: 'Displays', parent: null },
  { slug: 'accessories', name: 'Accessories', parent: null },
];

const BRAND_SPECS = [
  { slug: 'northwind', name: 'Northwind' },
  { slug: 'kinetic', name: 'Kinetic' },
  { slug: 'lumen', name: 'Lumen' },
];

/**
 * Where the mock serves its own assets from.
 *
 * Seeded logo URLs have to be absolute, because the portals fetch them from
 * the browser rather than through the API client.
 */
const PUBLIC_URL = process.env.MOCK_PUBLIC_URL ?? 'http://localhost:3000';

function logoUrl(slug: string): string {
  return `${PUBLIC_URL}/api/v1/sellers/${slug}/logo.svg`;
}

const SELLER_SPECS: {
  slug: string;
  name: string;
  status: Seller['status'];
  hasLogo: boolean;
}[] = [
  {
    slug: 'harbour-supply',
    name: 'Harbour Supply Co.',
    status: 'approved',
    hasLogo: true,
  },
  // No logo, so the monogram fallback is exercised by the seed data too.
  { slug: 'deskworks', name: 'Deskworks', status: 'approved', hasLogo: false },
];

const LOCATION_SPECS = [
  { code: 'LON-1', name: 'London fulfilment centre' },
  { code: 'MAN-1', name: 'Manchester fulfilment centre' },
];

/**
 * Seeded accounts. The password is the same for all of them and is compared in
 * plain text — this is a development stand-in, not an auth system.
 */
export const SEED_PASSWORD = 'password123';

const USER_SPECS: {
  key: string;
  name: string;
  email: string;
  roles: MockUser['roles'];
  seller: string | null;
}[] = [
  {
    key: 'admin',
    name: 'Ada Mwale',
    email: 'admin@commerce.test',
    roles: ['admin'],
    seller: null,
  },
  {
    key: 'deskworks',
    name: 'Dara Okoro',
    email: 'seller@deskworks.test',
    roles: ['customer', 'seller'],
    seller: 'deskworks',
  },
  {
    key: 'harbour',
    name: 'Hana Ito',
    email: 'seller@harboursupply.test',
    roles: ['customer', 'seller'],
    seller: 'harbour-supply',
  },
  {
    key: 'shopper',
    name: 'Sam Rivers',
    email: 'shopper@example.test',
    roles: ['customer'],
    seller: null,
  },
  {
    key: 'applicant',
    name: 'Ola Bergman',
    email: 'applicant@pinemoor.test',
    roles: ['customer'],
    seller: null,
  },
];

const PRODUCT_SPECS: ProductSpec[] = [
  {
    slug: 'meridian-standing-desk',
    name: 'Meridian standing desk',
    description:
      'Electric sit-stand desk with a solid timber top and a three-stage frame.',
    status: 'active',
    brand: 'northwind',
    category: 'desks',
    variants: [
      {
        name: 'Oak / 140cm',
        skuCode: 'MRD-DESK-OAK-140',
        attributes: { finish: 'Oak', width: '140cm' },
      },
      {
        name: 'Oak / 160cm',
        skuCode: 'MRD-DESK-OAK-160',
        attributes: { finish: 'Oak', width: '160cm' },
      },
      {
        name: 'Walnut / 160cm',
        skuCode: 'MRD-DESK-WAL-160',
        attributes: { finish: 'Walnut', width: '160cm' },
      },
    ],
  },
  {
    slug: 'kinetic-task-chair',
    name: 'Kinetic task chair',
    description:
      'Mesh-back task chair with adjustable lumbar support and 4D armrests.',
    status: 'active',
    brand: 'kinetic',
    category: 'seating',
    variants: [
      {
        name: 'Graphite',
        skuCode: 'KNT-CHAIR-GRA',
        attributes: { colour: 'Graphite' },
      },
      {
        name: 'Slate',
        skuCode: 'KNT-CHAIR-SLA',
        attributes: { colour: 'Slate' },
      },
    ],
  },
  {
    slug: 'lumen-27-monitor',
    name: 'Lumen 27" 4K monitor',
    description: '27-inch 4K IPS display with USB-C power delivery.',
    status: 'active',
    brand: 'lumen',
    category: 'displays',
    variants: [
      {
        name: 'Standard',
        skuCode: 'LMN-MON-27-STD',
        attributes: { size: '27"' },
      },
      {
        name: 'With height stand',
        skuCode: 'LMN-MON-27-HS',
        attributes: { size: '27"', stand: 'Height adjustable' },
      },
    ],
  },
  {
    slug: 'northwind-monitor-arm',
    name: 'Northwind monitor arm',
    description: 'Gas-spring single monitor arm with a desk clamp.',
    status: 'active',
    brand: 'northwind',
    category: 'accessories',
    variants: [
      {
        name: 'Single',
        skuCode: 'NW-ARM-SGL',
        attributes: { mounts: '1' },
      },
      {
        name: 'Dual',
        skuCode: 'NW-ARM-DUAL',
        attributes: { mounts: '2' },
      },
    ],
  },
  {
    slug: 'kinetic-footrest',
    name: 'Kinetic adjustable footrest',
    description: 'Tilting footrest with a textured non-slip surface.',
    status: 'draft',
    brand: 'kinetic',
    category: 'accessories',
    variants: [
      {
        name: 'Black',
        skuCode: 'KNT-FOOT-BLK',
        attributes: { colour: 'Black' },
      },
    ],
  },
  {
    slug: 'lumen-desk-lamp',
    name: 'Lumen desk lamp',
    description: 'Dimmable LED desk lamp with adjustable colour temperature.',
    status: 'archived',
    brand: 'lumen',
    category: 'accessories',
    variants: [
      {
        name: 'White',
        skuCode: 'LMN-LAMP-WHT',
        attributes: { colour: 'White' },
      },
    ],
  },
];

/** Offers seeded against the catalog, keyed by SKU code. */
const OFFER_SPECS: {
  skuCode: string;
  seller: string;
  price: number;
  compareAt: number | null;
  condition: Offer['condition'];
  status: Offer['status'];
  fulfillment: Offer['fulfillmentMode'];
  handlingTimeDays: number;
}[] = [
  {
    skuCode: 'MRD-DESK-OAK-140',
    seller: 'harbour-supply',
    price: 54900,
    compareAt: 59900,
    condition: 'new',
    status: 'active',
    fulfillment: 'platform',
    handlingTimeDays: 1,
  },
  {
    skuCode: 'MRD-DESK-OAK-140',
    seller: 'deskworks',
    price: 53500,
    compareAt: null,
    condition: 'new',
    status: 'active',
    fulfillment: 'seller',
    handlingTimeDays: 3,
  },
  {
    skuCode: 'MRD-DESK-OAK-160',
    seller: 'harbour-supply',
    price: 59900,
    compareAt: null,
    condition: 'new',
    status: 'active',
    fulfillment: 'platform',
    handlingTimeDays: 1,
  },
  {
    skuCode: 'MRD-DESK-WAL-160',
    seller: 'deskworks',
    price: 64900,
    compareAt: null,
    condition: 'new',
    status: 'draft',
    fulfillment: 'seller',
    handlingTimeDays: 5,
  },
  {
    skuCode: 'KNT-CHAIR-GRA',
    seller: 'harbour-supply',
    price: 32900,
    compareAt: 34900,
    condition: 'new',
    status: 'active',
    fulfillment: 'platform',
    handlingTimeDays: 1,
  },
  {
    skuCode: 'KNT-CHAIR-GRA',
    seller: 'deskworks',
    price: 28900,
    compareAt: null,
    condition: 'refurbished',
    status: 'active',
    fulfillment: 'seller',
    handlingTimeDays: 2,
  },
  {
    skuCode: 'KNT-CHAIR-SLA',
    seller: 'deskworks',
    price: 31900,
    compareAt: null,
    condition: 'new',
    status: 'inactive',
    fulfillment: 'seller',
    handlingTimeDays: 2,
  },
  {
    skuCode: 'LMN-MON-27-STD',
    seller: 'harbour-supply',
    price: 41900,
    compareAt: null,
    condition: 'new',
    status: 'active',
    fulfillment: 'platform',
    handlingTimeDays: 1,
  },
  {
    skuCode: 'LMN-MON-27-HS',
    seller: 'deskworks',
    price: 47900,
    compareAt: 49900,
    condition: 'new',
    status: 'active',
    fulfillment: 'threepl',
    handlingTimeDays: 2,
  },
  {
    skuCode: 'NW-ARM-SGL',
    seller: 'deskworks',
    price: 8900,
    compareAt: null,
    condition: 'new',
    status: 'active',
    fulfillment: 'seller',
    handlingTimeDays: 1,
  },
  {
    skuCode: 'NW-ARM-DUAL',
    seller: 'harbour-supply',
    price: 13900,
    compareAt: null,
    condition: 'new',
    status: 'draft',
    fulfillment: 'platform',
    handlingTimeDays: 1,
  },
];

/** Stock seeded per SKU, as `[onHand, reserved, damaged, inTransit, threshold]`. */
const STOCK: Record<string, [number, number, number, number, number]> = {
  'MRD-DESK-OAK-140': [42, 6, 1, 20, 10],
  'MRD-DESK-OAK-160': [18, 2, 0, 0, 10],
  'MRD-DESK-WAL-160': [7, 0, 0, 12, 10],
  'KNT-CHAIR-GRA': [96, 14, 2, 0, 25],
  'KNT-CHAIR-SLA': [23, 3, 0, 40, 25],
  'LMN-MON-27-STD': [61, 9, 0, 0, 15],
  'LMN-MON-27-HS': [12, 4, 1, 30, 15],
  'NW-ARM-SGL': [140, 22, 3, 0, 40],
  'NW-ARM-DUAL': [38, 5, 0, 0, 40],
  'KNT-FOOT-BLK': [0, 0, 0, 60, 20],
  'LMN-LAMP-WHT': [4, 0, 2, 0, 10],
};

export type MockSession = {
  token: string;
  userId: string;
  expiresAt: string;
};

export type MockDb = {
  users: MockUser[];
  sessions: MockSession[];
  applications: SellerApplication[];
  categories: Category[];
  brands: Brand[];
  sellers: Seller[];
  locations: InventoryLocation[];
  products: Product[];
  offers: Offer[];
  inventory: InventoryLevel[];
};

/** Builds a fresh database. Every call produces identical data. */
export function createSeedDb(): MockDb {
  const categories: Category[] = CATEGORY_SPECS.map((spec) => ({
    id: id(`category:${spec.slug}`),
    name: spec.name,
    slug: spec.slug,
    parentId: spec.parent ? id(`category:${spec.parent}`) : null,
    productCount: 0,
  }));

  const brands: Brand[] = BRAND_SPECS.map((spec) => ({
    id: id(`brand:${spec.slug}`),
    name: spec.name,
    slug: spec.slug,
    productCount: 0,
  }));

  const sellers: Seller[] = SELLER_SPECS.map((spec) => ({
    id: id(`seller:${spec.slug}`),
    name: spec.name,
    slug: spec.slug,
    status: spec.status,
    logoUrl: spec.hasLogo ? logoUrl(spec.slug) : null,
  }));

  const locations: InventoryLocation[] = LOCATION_SPECS.map((spec) => ({
    id: id(`location:${spec.code}`),
    name: spec.name,
    code: spec.code,
    sellerId: null,
  }));

  // Each approved seller holds their own stock somewhere.
  for (const spec of SELLER_SPECS) {
    locations.push({
      id: id(`location:seller:${spec.slug}`),
      name: `${spec.name} stock`,
      code: spec.slug.toUpperCase().slice(0, 8),
      sellerId: id(`seller:${spec.slug}`),
    });
  }

  const products: Product[] = PRODUCT_SPECS.map((spec) => {
    const productId = id(`product:${spec.slug}`);

    return {
      id: productId,
      name: spec.name,
      slug: spec.slug,
      description: spec.description,
      status: spec.status,
      brandId: spec.brand ? id(`brand:${spec.brand}`) : null,
      categoryId: spec.category ? id(`category:${spec.category}`) : null,
      proposedBrandName: null,
      proposedCategoryName: null,
      submittedBySellerId: null,
      submittedBySellerName: null,
      rejectionReason: null,
      createdAt: NOW,
      updatedAt: NOW,
      variants: spec.variants.map((variant) => ({
        id: id(`variant:${variant.skuCode}`),
        productId,
        name: variant.name,
        attributes: { ...variant.attributes },
        sku: {
          id: id(`sku:${variant.skuCode}`),
          variantId: id(`variant:${variant.skuCode}`),
          code: variant.skuCode,
        },
      })),
    };
  });

  const bySkuCode = new Map(
    products.flatMap((product) =>
      product.variants.map((variant) => [
        variant.sku.code,
        { product, variant },
      ]),
    ),
  );

  const offers: Offer[] = OFFER_SPECS.map((spec, index) => {
    const entry = bySkuCode.get(spec.skuCode);
    if (!entry) {
      throw new Error(`Seed offer references unknown SKU ${spec.skuCode}`);
    }

    return {
      id: id(`offer:${spec.seller}:${spec.skuCode}:${index}`),
      skuId: entry.variant.sku.id,
      skuCode: entry.variant.sku.code,
      productId: entry.product.id,
      productName: entry.product.name,
      variantName: entry.variant.name,
      sellerId: id(`seller:${spec.seller}`),
      sellerName:
        SELLER_SPECS.find((seller) => seller.slug === spec.seller)?.name ??
        spec.seller,
      price: money(spec.price),
      compareAtPrice: spec.compareAt === null ? null : money(spec.compareAt),
      condition: spec.condition,
      status: spec.status,
      fulfillmentMode: spec.fulfillment,
      handlingTimeDays: spec.handlingTimeDays,
      createdAt: NOW,
      updatedAt: NOW,
    };
  });

  const inventory: InventoryLevel[] = [];
  for (const [skuCode, entry] of bySkuCode) {
    const [onHand, reserved, damaged, inTransit, threshold] = STOCK[
      skuCode
    ] ?? [0, 0, 0, 0, 0];

    // Stock sits at the primary platform location; the secondary holds a
    // share of it. Seller-held stock is added afterwards, per offer.
    const platformLocations = locations.filter(
      (location) => location.sellerId === null,
    );
    platformLocations.forEach((location, index) => {
      const share = index === 0 ? 1 : 0.35;
      const locationOnHand = Math.round(onHand * share);
      const locationReserved = Math.min(
        locationOnHand,
        Math.round(reserved * share),
      );

      inventory.push({
        skuId: entry.variant.sku.id,
        skuCode,
        productId: entry.product.id,
        productName: entry.product.name,
        variantName: entry.variant.name,
        locationId: location.id,
        locationName: location.name,
        locationSellerId: null,
        onHand: locationOnHand,
        reserved: locationReserved,
        available: locationOnHand - locationReserved,
        damaged: index === 0 ? damaged : 0,
        inTransit: index === 0 ? inTransit : 0,
        reorderThreshold: threshold,
        updatedAt: NOW,
      });
    });
  }

  const users: MockUser[] = USER_SPECS.map((spec) => ({
    id: id(`user:${spec.key}`),
    email: spec.email,
    name: spec.name,
    // Copied, not shared: granting a role must not mutate the seed spec and
    // leak into the next reset.
    roles: [...spec.roles],
    sellerId: spec.seller ? id(`seller:${spec.seller}`) : null,
    password: SEED_PASSWORD,
    createdAt: NOW,
  }));

  // One application already waiting, so the admin queue is not empty on a
  // first run and the approval path can be exercised immediately.
  const applicant = users.find(
    (user) => user.email === 'applicant@pinemoor.test',
  )!;
  const applications: SellerApplication[] = [
    {
      id: id('application:pinemoor'),
      userId: applicant.id,
      userName: applicant.name,
      userEmail: applicant.email,
      displayName: 'Pinemoor Trading',
      slug: 'pinemoor',
      contactEmail: 'trade@pinemoor.test',
      description:
        'Reclaimed timber furniture and desk accessories, made to order in Yorkshire.',
      status: 'pending',
      rejectionReason: null,
      sellerId: null,
      createdAt: NOW,
      reviewedAt: null,
    },
  ];

  // Every seller with an offer holds some of that SKU themselves.
  for (const offer of offers) {
    const location = locations.find(
      (candidate) => candidate.sellerId === offer.sellerId,
    );
    const entry = bySkuCode.get(offer.skuCode);
    if (!location || !entry) {
      continue;
    }
    if (
      inventory.some(
        (level) =>
          level.skuId === offer.skuId && level.locationId === location.id,
      )
    ) {
      continue;
    }

    const [onHand = 0, reserved = 0, , , threshold = 0] =
      STOCK[offer.skuCode] ?? [];
    const sellerOnHand = Math.max(1, Math.round(onHand * 0.4));
    const sellerReserved = Math.min(sellerOnHand, Math.round(reserved * 0.4));

    inventory.push({
      skuId: offer.skuId,
      skuCode: offer.skuCode,
      productId: entry.product.id,
      productName: entry.product.name,
      variantName: entry.variant.name,
      locationId: location.id,
      locationName: location.name,
      locationSellerId: offer.sellerId,
      onHand: sellerOnHand,
      reserved: sellerReserved,
      available: sellerOnHand - sellerReserved,
      damaged: 0,
      inTransit: 0,
      reorderThreshold: threshold,
      updatedAt: NOW,
    });
  }

  return {
    users,
    sessions: [],
    applications,
    categories,
    brands,
    sellers,
    locations,
    products,
    offers,
    inventory,
  };
}

/** The seller the seller portal acts as until authentication exists. */
export const CURRENT_SELLER_ID = id('seller:deskworks');
