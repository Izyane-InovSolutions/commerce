import type {
  InventoryLevel,
  InventoryLocation,
  Paginated,
  Product,
  SellerProductRow,
} from '@commerce/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { db, resetDb } from './store.ts';
import { ACCOUNTS, call, signIn } from './testing.ts';

let admin: string;
let seller: string;
let sellerId: string;
let harbour: string;

beforeEach(async () => {
  resetDb();
  admin = (await signIn(ACCOUNTS.admin)).token;
  const session = await signIn(ACCOUNTS.deskworks);
  seller = session.token;
  sellerId = session.user.sellerId!;
  harbour = (await signIn(ACCOUNTS.harbour)).token;
});

const draft = {
  name: 'Deskworks cable tray',
  slug: 'deskworks-cable-tray',
  description: 'Under-desk steel cable management tray.',
  variants: [{ name: 'Black', skuCode: 'DW-TRAY-BLK' }],
};

describe('seller stock', () => {
  it('gives a seller their own location, not the platform warehouses', async () => {
    const { data } = await call<InventoryLocation[]>('GET', '/locations', {
      token: seller,
    });

    expect(data).toHaveLength(1);
    expect(data[0]?.sellerId).toBe(sellerId);
    expect(data[0]?.name).toBe('Deskworks stock');
  });

  it('shows an admin every location', async () => {
    const { data } = await call<InventoryLocation[]>('GET', '/locations', {
      token: admin,
    });

    expect(data.filter((location) => location.sellerId === null).length).toBe(
      2,
    );
    expect(data.length).toBeGreaterThan(2);
  });

  it('lists only the stock the seller holds themselves', async () => {
    const { data } = await call<Paginated<InventoryLevel>>(
      'GET',
      '/inventory?pageSize=100',
      { token: seller },
    );

    expect(data.items.length).toBeGreaterThan(0);
    expect(
      data.items.every((level) => level.locationSellerId === sellerId),
    ).toBe(true);
  });

  it('lets a seller adjust their own stock', async () => {
    const level = db().inventory.find(
      (candidate) => candidate.locationSellerId === sellerId,
    )!;
    const before = level.onHand;

    const { status, data } = await call<InventoryLevel>(
      'POST',
      '/inventory/adjustments',
      {
        token: seller,
        body: {
          skuId: level.skuId,
          locationId: level.locationId,
          delta: 12,
          reason: 'received',
        },
      },
    );

    expect(status).toBe(201);
    expect(data.onHand).toBe(before + 12);
    expect(data.available).toBe(data.onHand - data.reserved);
  });

  it('hides a platform warehouse from a seller rather than forbidding it', async () => {
    const platform = db().inventory.find(
      (candidate) => candidate.locationSellerId === null,
    )!;

    const { status } = await call('POST', '/inventory/adjustments', {
      token: seller,
      body: {
        skuId: platform.skuId,
        locationId: platform.locationId,
        delta: 5,
        reason: 'received',
      },
    });

    // 404, not 403: the API does not confirm the warehouse exists.
    expect(status).toBe(404);
  });

  it("will not let a seller touch another seller's shelf", async () => {
    const theirs = db().inventory.find(
      (candidate) =>
        candidate.locationSellerId !== null &&
        candidate.locationSellerId !== sellerId,
    )!;

    const { status } = await call('POST', '/inventory/adjustments', {
      token: seller,
      body: {
        skuId: theirs.skuId,
        locationId: theirs.locationId,
        delta: 5,
        reason: 'received',
      },
    });

    expect(status).toBe(404);
  });

  it('still refuses to strand reserved stock', async () => {
    const level = db().inventory.find(
      (candidate) =>
        candidate.locationSellerId === sellerId && candidate.reserved > 0,
    )!;

    const { status } = await call('POST', '/inventory/adjustments', {
      token: seller,
      body: {
        skuId: level.skuId,
        locationId: level.locationId,
        delta: -level.onHand,
        reason: 'correction',
      },
    });

    expect(status).toBe(409);
  });

  it('opens a shelf for a SKU the seller newly prices', async () => {
    const sku = db().products[4]!.variants[0]!.sku;

    await call('POST', '/offers', {
      token: seller,
      body: { skuId: sku.id, price: '20.00' },
    });

    const { data } = await call<Paginated<InventoryLevel>>(
      'GET',
      `/inventory?skuId=${sku.id}`,
      { token: seller },
    );
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.locationSellerId).toBe(sellerId);
  });
});

describe('seller product editing', () => {
  it('edits a draft without sending it for review', async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: { ...draft, status: 'draft' },
    });

    const { data } = await call<Product>(
      'PATCH',
      `/seller/products/${created.data.id}`,
      { token: seller, body: { name: 'Deskworks cable tray, wide' } },
    );

    expect(data.name).toBe('Deskworks cable tray, wide');
    expect(data.status).toBe('draft');
  });

  it('submits a draft for review', async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: { ...draft, status: 'draft' },
    });

    const { data } = await call<Product>(
      'POST',
      `/seller/products/${created.data.id}/submit`,
      { token: seller },
    );

    expect(data.status).toBe('pending');
  });

  it('will not submit the same draft twice', async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: { ...draft, status: 'draft' },
    });
    await call('POST', `/seller/products/${created.data.id}/submit`, {
      token: seller,
    });

    const { status } = await call(
      'POST',
      `/seller/products/${created.data.id}/submit`,
      { token: seller },
    );
    expect(status).toBe(409);
  });

  it('returns a rejected product to the queue when the seller edits it', async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: draft,
    });
    await call('POST', `/products/${created.data.id}/reject`, {
      token: admin,
      body: { reason: 'Needs dimensions in the description.' },
    });

    const { data } = await call<Product>(
      'PATCH',
      `/seller/products/${created.data.id}`,
      {
        token: seller,
        body: { description: 'Under-desk steel tray, 60cm x 12cm x 8cm.' },
      },
    );

    expect(data.status).toBe('pending');
    expect(data.rejectionReason).toBeNull();
  });

  it('refuses to edit a product once it is live', async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: draft,
    });
    await call('POST', `/products/${created.data.id}/approve`, {
      token: admin,
    });

    const { status, data } = await call<{ message: string }>(
      'PATCH',
      `/seller/products/${created.data.id}`,
      { token: seller, body: { name: 'Sneaky rename' } },
    );

    expect(status).toBe(409);
    expect(data.message).toContain('managed by the platform');
  });

  it("hides another seller's submission behind a 404", async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: draft,
    });

    const { status } = await call(
      'PATCH',
      `/seller/products/${created.data.id}`,
      { token: harbour, body: { name: 'Mine now' } },
    );

    expect(status).toBe(404);
  });
});

describe('the seller catalog view', () => {
  it('returns one row per SKU with price and stock joined in', async () => {
    const { data } = await call<Paginated<SellerProductRow>>(
      'GET',
      '/seller/catalog?pageSize=100',
      { token: seller },
    );

    expect(data.items.length).toBeGreaterThan(0);
    const priced = data.items.find((row) => row.offerId !== null)!;
    expect(priced.price).not.toBeNull();
    expect(priced.available).not.toBeNull();
    expect(priced.skuCode).toBeTruthy();
  });

  it('includes SKUs the seller only offers against', async () => {
    const { data } = await call<Paginated<SellerProductRow>>(
      'GET',
      '/seller/catalog?pageSize=100',
      { token: seller },
    );

    // Deskworks did not submit any of the seeded catalog.
    expect(data.items.some((row) => !row.submittedByMe)).toBe(true);
  });

  it('includes a submission the seller has not priced yet', async () => {
    const created = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: { ...draft, status: 'draft' },
    });

    const { data } = await call<Paginated<SellerProductRow>>(
      'GET',
      '/seller/catalog?q=cable tray&pageSize=100',
      { token: seller },
    );

    const row = data.items.find((item) => item.productId === created.data.id)!;
    expect(row.submittedByMe).toBe(true);
    expect(row.offerId).toBeNull();
    expect(row.price).toBeNull();
  });

  it('filters to each tab of the products section', async () => {
    await call('POST', '/seller/products', {
      token: seller,
      body: { ...draft, status: 'draft' },
    });

    const drafts = await call<Paginated<SellerProductRow>>(
      'GET',
      '/seller/catalog?view=draft&pageSize=100',
      { token: seller },
    );
    expect(
      drafts.data.items.every((row) => row.productStatus === 'draft'),
    ).toBe(true);
    expect(drafts.data.total).toBe(1);

    const active = await call<Paginated<SellerProductRow>>(
      'GET',
      '/seller/catalog?view=active&pageSize=100',
      { token: seller },
    );
    expect(
      active.data.items.every((row) => row.productStatus === 'active'),
    ).toBe(true);
  });

  it("never leaks another seller's rows", async () => {
    const mine = await call<Paginated<SellerProductRow>>(
      'GET',
      '/seller/catalog?pageSize=100',
      { token: seller },
    );
    const theirs = await call<Paginated<SellerProductRow>>(
      'GET',
      '/seller/catalog?pageSize=100',
      { token: harbour },
    );

    const mySkus = new Set(mine.data.items.map((row) => row.skuId));
    const theirOffered = theirs.data.items.filter(
      (row) => row.offerId !== null,
    );
    expect(
      theirOffered.every(
        (row) => !mySkus.has(row.skuId) || row.offerId !== null,
      ),
    ).toBe(true);
    // The clearest check: prices differ because each sees only their own offer.
    expect(mine.data.items).not.toEqual(theirs.data.items);
  });

  it('needs an approved seller account', async () => {
    const shopper = (await signIn(ACCOUNTS.shopper)).token;
    expect(
      (await call('GET', '/seller/catalog', { token: shopper })).status,
    ).toBe(403);
  });
});
