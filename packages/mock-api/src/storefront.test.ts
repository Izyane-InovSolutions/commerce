import type {
  Paginated,
  Product,
  StorefrontProduct,
} from '@commerce/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { db, resetDb } from './store.ts';
import { ACCOUNTS, call, signIn } from './testing.ts';

let admin: string;
let seller: string;

beforeEach(async () => {
  resetDb();
  admin = (await signIn(ACCOUNTS.admin)).token;
  seller = (await signIn(ACCOUNTS.deskworks)).token;
});

function slugs(page: Paginated<StorefrontProduct>): string[] {
  return page.items.map((item) => item.slug);
}

describe('storefront listings', () => {
  it('needs no session — this is what shoppers see', async () => {
    const { status } = await call('GET', '/storefront/products');
    expect(status).toBe(200);
  });

  it('shows only active products that have a buyable offer', async () => {
    const { data } = await call<Paginated<StorefrontProduct>>(
      'GET',
      '/storefront/products?pageSize=100',
    );

    // Seeded catalog: the footrest is draft, the lamp archived, and neither
    // has an active offer, so neither is on sale.
    expect(slugs(data)).not.toContain('kinetic-footrest');
    expect(slugs(data)).not.toContain('lumen-desk-lamp');
    expect(slugs(data)).toContain('meridian-standing-desk');
  });

  it('leads with the cheapest offer and counts the rest', async () => {
    const { data } = await call<StorefrontProduct>(
      'GET',
      '/storefront/products/meridian-standing-desk',
    );

    const prices = data.offers.map((offer) => offer.price.amountMinor);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(data.fromPrice.amountMinor).toBe(prices[0]);
    expect(data.offerCount).toBe(data.offers.length);
  });

  it('hides an offer that has nothing on the shelf', async () => {
    const desk = db().products.find(
      (p) => p.slug === 'meridian-standing-desk',
    )!;

    const before = await call<StorefrontProduct>(
      'GET',
      '/storefront/products/meridian-standing-desk',
    );
    expect(before.data.offerCount).toBeGreaterThan(0);

    // Empty every shelf for this product's SKUs.
    const skuIds = new Set(desk.variants.map((variant) => variant.sku.id));
    for (const level of db().inventory.filter((l) => skuIds.has(l.skuId))) {
      level.onHand = 0;
      level.reserved = 0;
      level.available = 0;
    }

    expect(
      (await call('GET', '/storefront/products/meridian-standing-desk')).status,
    ).toBe(404);
  });

  it('hides a product whose only offers are not active', async () => {
    const chair = db().products.find((p) => p.slug === 'kinetic-task-chair')!;
    for (const offer of db().offers.filter((o) => o.productId === chair.id)) {
      offer.status = 'inactive';
    }

    const { data } = await call<Paginated<StorefrontProduct>>(
      'GET',
      '/storefront/products?pageSize=100',
    );
    expect(slugs(data)).not.toContain('kinetic-task-chair');
  });

  it('drops a suspended seller from the storefront', async () => {
    const deskworks = db().sellers.find((s) => s.slug === 'deskworks')!;

    const before = await call<StorefrontProduct>(
      'GET',
      '/storefront/products/meridian-standing-desk',
    );
    expect(
      before.data.offers.some((offer) => offer.sellerId === deskworks.id),
    ).toBe(true);

    await call('POST', `/sellers/${deskworks.id}/suspend`, { token: admin });

    const after = await call<StorefrontProduct>(
      'GET',
      '/storefront/products/meridian-standing-desk',
    );
    expect(
      after.data.offers.some((offer) => offer.sellerId === deskworks.id),
    ).toBe(false);
  });

  it('narrows the from-price when filtering by condition', async () => {
    const { data } = await call<Paginated<StorefrontProduct>>(
      'GET',
      '/storefront/products?condition=refurbished&pageSize=100',
    );

    expect(data.items.length).toBeGreaterThan(0);
    for (const listing of data.items) {
      expect(
        listing.offers.every((offer) => offer.condition === 'refurbished'),
      ).toBe(true);
      expect(listing.fromPrice).toEqual(listing.offers[0]?.price);
    }
  });

  it('searches by name and brand', async () => {
    const byName = await call<Paginated<StorefrontProduct>>(
      'GET',
      '/storefront/products?q=monitor',
    );
    expect(byName.data.total).toBeGreaterThan(0);

    const byBrand = await call<Paginated<StorefrontProduct>>(
      'GET',
      '/storefront/products?q=Lumen',
    );
    expect(byBrand.data.total).toBeGreaterThan(0);
  });

  it('answers 404 for something that is not on sale', async () => {
    expect(
      (await call('GET', '/storefront/products/kinetic-footrest')).status,
    ).toBe(404);
    expect(
      (await call('GET', '/storefront/products/does-not-exist')).status,
    ).toBe(404);
  });

  it('never exposes internal fields on an offer', async () => {
    const { data } = await call<StorefrontProduct>(
      'GET',
      '/storefront/products/meridian-standing-desk',
    );

    for (const offer of data.offers) {
      expect(offer).not.toHaveProperty('status');
      expect(offer).not.toHaveProperty('createdAt');
    }
  });
});

describe('the full path from submission to shopper', () => {
  it('puts a seller-submitted product on sale only after approval', async () => {
    const submitted = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: {
        name: 'Deskworks monitor riser',
        slug: 'deskworks-monitor-riser',
        description: 'Solid ash monitor riser with a cable channel.',
        variants: [{ name: 'Ash', skuCode: 'DW-RISER-ASH' }],
      },
    });
    const skuId = submitted.data.variants[0]!.sku.id;

    const offer = await call('POST', '/offers', {
      token: seller,
      body: { skuId, price: '64.00', status: 'active' },
    });
    expect(offer.status).toBe(201);

    // Priced and active, but the product has not been reviewed.
    expect(
      (await call('GET', '/storefront/products/deskworks-monitor-riser'))
        .status,
    ).toBe(404);

    await call('POST', `/products/${submitted.data.id}/approve`, {
      token: admin,
    });

    // Approved, but there is still nothing on the shelf to send.
    expect(
      (await call('GET', '/storefront/products/deskworks-monitor-riser'))
        .status,
    ).toBe(404);

    const stock = await call<{ items: { locationId: string }[] }>(
      'GET',
      `/inventory?skuId=${skuId}`,
      { token: seller },
    );
    expect(stock.data.items).toHaveLength(1);

    const adjusted = await call('POST', '/inventory/adjustments', {
      token: seller,
      body: {
        skuId,
        locationId: stock.data.items[0]!.locationId,
        delta: 8,
        reason: 'received',
      },
    });
    expect(adjusted.status).toBe(201);

    const live = await call<StorefrontProduct>(
      'GET',
      '/storefront/products/deskworks-monitor-riser',
    );
    expect(live.status).toBe(200);
    expect(live.data.fromPrice.amountMinor).toBe(6400);
    expect(live.data.offers[0]?.sellerName).toBe('Deskworks');
  });

  it('keeps a rejected submission off the storefront', async () => {
    const submitted = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: {
        name: 'Deskworks mystery box',
        slug: 'deskworks-mystery-box',
        description: 'A box of assorted items.',
        variants: [{ name: 'Standard', skuCode: 'DW-MYSTERY' }],
      },
    });

    await call('POST', '/offers', {
      token: seller,
      body: {
        skuId: submitted.data.variants[0]!.sku.id,
        price: '20.00',
        status: 'active',
      },
    });
    await call('POST', `/products/${submitted.data.id}/reject`, {
      token: admin,
      body: { reason: 'Contents must be described.' },
    });

    expect(
      (await call('GET', '/storefront/products/deskworks-mystery-box')).status,
    ).toBe(404);
  });
});
