import type {
  InventoryLevel,
  Offer,
  Paginated,
  Product,
} from '@commerce/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { db, resetDb } from './store.ts';
import { ACCOUNTS, call, signIn } from './testing.ts';

let admin: string;
let seller: string;
let sellerId: string;

beforeEach(async () => {
  resetDb();
  admin = (await signIn(ACCOUNTS.admin)).token;
  const session = await signIn(ACCOUNTS.deskworks);
  seller = session.token;
  sellerId = session.user.sellerId!;
});

describe('products', () => {
  it('lists seeded products with pagination metadata', async () => {
    const { data } = await call<Paginated<Product>>('GET', '/products', {
      token: admin,
    });

    expect(data.total).toBe(6);
    expect(data.page).toBe(1);
    expect(data.items).toHaveLength(6);
  });

  it('filters by status', async () => {
    const { data } = await call<Paginated<Product>>(
      'GET',
      '/products?status=archived',
      { token: admin },
    );

    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.slug).toBe('lumen-desk-lamp');
  });

  it('searches across name and sku code', async () => {
    const byName = await call<Paginated<Product>>('GET', '/products?q=chair', {
      token: admin,
    });
    expect(byName.data.items[0]?.slug).toBe('kinetic-task-chair');

    const bySku = await call<Paginated<Product>>('GET', '/products?q=NW-ARM', {
      token: admin,
    });
    expect(bySku.data.items[0]?.slug).toBe('northwind-monitor-arm');
  });

  it('pages through results', async () => {
    const { data } = await call<Paginated<Product>>(
      'GET',
      '/products?page=2&pageSize=4',
      { token: admin },
    );

    expect(data.items).toHaveLength(2);
    expect(data.totalPages).toBe(2);
  });

  it('creates a product and gives its SKUs stock records', async () => {
    const created = await call<Product>('POST', '/products', {
      token: admin,
      body: {
        name: 'Anchor bookshelf',
        slug: 'anchor-bookshelf',
        variants: [{ name: 'Oak', skuCode: 'ANC-SHELF-OAK' }],
      },
    });

    expect(created.status).toBe(201);
    expect(created.data.status).toBe('draft');
    expect(created.data.submittedBySellerId).toBeNull();

    const stock = await call<Paginated<InventoryLevel>>(
      'GET',
      '/inventory?q=ANC-SHELF-OAK',
      { token: admin },
    );
    // A platform-owned product is stocked at platform fulfilment centres,
    // not at every seller's own location.
    const platformLocations = db().locations.filter(
      (location) => location.sellerId === null,
    );
    expect(stock.data.items).toHaveLength(platformLocations.length);
    expect(stock.data.items[0]?.onHand).toBe(0);
    expect(stock.data.items[0]?.locationSellerId).toBeNull();
  });

  it('rejects a duplicate slug', async () => {
    const { status } = await call('POST', '/products', {
      token: admin,
      body: {
        name: 'Another desk',
        slug: 'meridian-standing-desk',
        variants: [{ name: 'One', skuCode: 'DUP-1' }],
      },
    });

    expect(status).toBe(409);
  });

  it('rejects a product with no variants', async () => {
    const { status } = await call('POST', '/products', {
      token: admin,
      body: { name: 'Empty', slug: 'empty', variants: [] },
    });

    expect(status).toBe(400);
  });

  it('rejects two variants sharing a sku code', async () => {
    const { status } = await call('POST', '/products', {
      token: admin,
      body: {
        name: 'Clashing',
        slug: 'clashing',
        variants: [
          { name: 'A', skuCode: 'CLASH-1' },
          { name: 'B', skuCode: 'CLASH-1' },
        ],
      },
    });

    expect(status).toBe(409);
  });

  it('updates only the fields supplied', async () => {
    const product = db().products[0]!;
    const { data } = await call<Product>('PATCH', `/products/${product.id}`, {
      token: admin,
      body: { status: 'archived' },
    });

    expect(data.status).toBe('archived');
    expect(data.name).toBe(product.name);
  });

  it('answers 404 for an unknown product', async () => {
    const { status } = await call(
      'GET',
      '/products/00000000-0000-4000-8000-000000000000',
      { token: admin },
    );
    expect(status).toBe(404);
  });
});

describe('offers', () => {
  it('scopes a seller listing to their own offers', async () => {
    const { data } = await call<Paginated<Offer>>('GET', '/offers', {
      token: seller,
    });

    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.every((offer) => offer.sellerId === sellerId)).toBe(true);
  });

  it('creates an offer against a SKU the seller does not yet cover', async () => {
    const sku = db().products[4]!.variants[0]!.sku;
    const { status, data } = await call<Offer>('POST', '/offers', {
      token: seller,
      body: { skuId: sku.id, price: '42.50' },
    });

    expect(status).toBe(201);
    expect(data.price).toEqual({ amountMinor: 4250, currency: 'GBP' });
    expect(data.skuCode).toBe(sku.code);
    expect(data.sellerId).toBe(sellerId);
  });

  it('refuses a second offer from the same seller on one SKU', async () => {
    const existing = db().offers.find((offer) => offer.sellerId === sellerId)!;

    const { status } = await call('POST', '/offers', {
      token: seller,
      body: { skuId: existing.skuId, price: '10.00' },
    });

    expect(status).toBe(409);
  });

  it('rejects a malformed price', async () => {
    const sku = db().products[4]!.variants[0]!.sku;
    const { status } = await call('POST', '/offers', {
      token: seller,
      body: { skuId: sku.id, price: '10.999' },
    });

    expect(status).toBe(400);
  });

  it('updates a price in place', async () => {
    const offer = db().offers.find(
      (candidate) => candidate.sellerId === sellerId,
    )!;
    const { data } = await call<Offer>('PATCH', `/offers/${offer.id}`, {
      token: seller,
      body: { price: '99.00', status: 'active' },
    });

    expect(data.price.amountMinor).toBe(9900);
    expect(data.status).toBe('active');
  });
});

describe('inventory', () => {
  it('derives available from on-hand less reserved', async () => {
    const { data } = await call<Paginated<InventoryLevel>>(
      'GET',
      '/inventory',
      {
        token: admin,
      },
    );

    expect(
      data.items.every(
        (level) => level.available === level.onHand - level.reserved,
      ),
    ).toBe(true);
  });

  it('filters to stock below its reorder threshold', async () => {
    const { data } = await call<Paginated<InventoryLevel>>(
      'GET',
      '/inventory?belowThreshold=true&pageSize=100',
      { token: admin },
    );

    expect(data.items.length).toBeGreaterThan(0);
    expect(
      data.items.every((level) => level.available < level.reorderThreshold),
    ).toBe(true);
  });

  it('applies a positive adjustment and recomputes available', async () => {
    const level = db().inventory[0]!;
    const before = level.onHand;

    const { data } = await call<InventoryLevel>(
      'POST',
      '/inventory/adjustments',
      {
        token: admin,
        body: {
          skuId: level.skuId,
          locationId: level.locationId,
          delta: 5,
          reason: 'received',
        },
      },
    );

    expect(data.onHand).toBe(before + 5);
    expect(data.available).toBe(data.onHand - data.reserved);
  });

  it('moves written-off stock into the damaged bucket', async () => {
    const level = db().inventory[0]!;
    const damagedBefore = level.damaged;

    const { data } = await call<InventoryLevel>(
      'POST',
      '/inventory/adjustments',
      {
        token: admin,
        body: {
          skuId: level.skuId,
          locationId: level.locationId,
          delta: -2,
          reason: 'damaged',
        },
      },
    );

    expect(data.damaged).toBe(damagedBefore + 2);
  });

  it('refuses an adjustment that would eat into reserved stock', async () => {
    const level = db().inventory.find((candidate) => candidate.reserved > 0)!;

    const { status } = await call('POST', '/inventory/adjustments', {
      token: admin,
      body: {
        skuId: level.skuId,
        locationId: level.locationId,
        delta: -level.onHand,
        reason: 'correction',
      },
    });

    expect(status).toBe(409);
  });

  it('rejects a zero adjustment', async () => {
    const level = db().inventory[0]!;

    const { status } = await call('POST', '/inventory/adjustments', {
      token: admin,
      body: {
        skuId: level.skuId,
        locationId: level.locationId,
        delta: 0,
        reason: 'correction',
      },
    });

    expect(status).toBe(400);
  });
});

describe('routing', () => {
  it('answers 404 for an unknown path', async () => {
    const { status } = await call('GET', '/nope', { token: admin });
    expect(status).toBe(404);
  });

  it('serves health, marking itself as the stand-in API', async () => {
    const { data } = await call<{ status: string; mock: boolean }>(
      'GET',
      '/health',
    );

    expect(data.status).toBe('ok');
    // The real API omits this, which is how a client tells the two apart.
    expect(data.mock).toBe(true);
  });
});
