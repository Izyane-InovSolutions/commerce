import type { Brand, Category, Product } from '@commerce/contracts';
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

const submission = {
  name: 'Deskworks bamboo riser',
  slug: 'deskworks-bamboo-riser',
  description: 'Bamboo monitor riser with a drawer.',
  variants: [{ name: 'Natural', skuCode: 'DW-RISER-BAM' }],
};

async function submitWithProposals(
  extra: Record<string, unknown> = {},
): Promise<Product> {
  const { data } = await call<Product>('POST', '/seller/products', {
    token: seller,
    body: {
      ...submission,
      proposedBrandName: 'Bamboo Works',
      proposedCategoryName: 'Risers',
      ...extra,
    },
  });
  return data;
}

describe('proposing a brand or category', () => {
  it('records what the seller named', async () => {
    const product = await submitWithProposals();

    expect(product.proposedBrandName).toBe('Bamboo Works');
    expect(product.proposedCategoryName).toBe('Risers');
    expect(product.brandId).toBeNull();
    expect(product.categoryId).toBeNull();
  });

  it('does not create anything in the shared taxonomy yet', async () => {
    await submitWithProposals();

    const brands = await call<Brand[]>('GET', '/brands');
    expect(brands.data.some((brand) => brand.name === 'Bamboo Works')).toBe(
      false,
    );
  });

  it('refuses a proposal alongside an existing selection', async () => {
    const brand = db().brands[0]!;
    const { status } = await call('POST', '/seller/products', {
      token: seller,
      body: {
        ...submission,
        brandId: brand.id,
        proposedBrandName: 'Bamboo Works',
      },
    });

    expect(status).toBe(400);
  });

  it('withdraws the proposal when the seller picks an existing entry', async () => {
    const product = await submitWithProposals();
    const brand = db().brands[0]!;

    const { data } = await call<Product>(
      'PATCH',
      `/seller/products/${product.id}`,
      { token: seller, body: { brandId: brand.id } },
    );

    expect(data.brandId).toBe(brand.id);
    expect(data.proposedBrandName).toBeNull();
  });

  it('clears an existing selection when the seller proposes instead', async () => {
    const brand = db().brands[0]!;
    const { data: created } = await call<Product>('POST', '/seller/products', {
      token: seller,
      body: { ...submission, brandId: brand.id },
    });

    const { data } = await call<Product>(
      'PATCH',
      `/seller/products/${created.id}`,
      { token: seller, body: { proposedBrandName: 'Bamboo Works' } },
    );

    expect(data.proposedBrandName).toBe('Bamboo Works');
    expect(data.brandId).toBeNull();
  });
});

describe('the approval gate', () => {
  it('will not approve while a proposal is unsettled', async () => {
    const product = await submitWithProposals();

    const { status, data } = await call<{ message: string }>(
      'POST',
      `/products/${product.id}/approve`,
      { token: admin },
    );

    expect(status).toBe(409);
    expect(data.message).toBe(
      'Settle the proposed brand and category before approving.',
    );
  });

  it('names only the axis still outstanding', async () => {
    const product = await submitWithProposals({ proposedCategoryName: null });

    const { data } = await call<{ message: string }>(
      'POST',
      `/products/${product.id}/approve`,
      { token: admin },
    );

    expect(data.message).toBe('Settle the proposed brand before approving.');
  });

  it('approves once both are settled', async () => {
    const product = await submitWithProposals();

    await call('POST', `/products/${product.id}/brand`, {
      token: admin,
      body: { action: 'create', name: 'Bamboo Works', slug: 'bamboo-works' },
    });
    await call('POST', `/products/${product.id}/category`, {
      token: admin,
      body: { action: 'dismiss' },
    });

    const { status, data } = await call<Product>(
      'POST',
      `/products/${product.id}/approve`,
      { token: admin },
    );

    expect(status).toBe(201);
    expect(data.status).toBe('active');
  });
});

describe('settling a proposal', () => {
  it('creates the brand and attaches it', async () => {
    const product = await submitWithProposals();

    const { data } = await call<Product>(
      'POST',
      `/products/${product.id}/brand`,
      {
        token: admin,
        body: { action: 'create', name: 'Bamboo Works', slug: 'bamboo-works' },
      },
    );

    expect(data.proposedBrandName).toBeNull();
    expect(data.brandId).not.toBeNull();

    const brands = await call<Brand[]>('GET', '/brands');
    const created = brands.data.find((brand) => brand.slug === 'bamboo-works')!;
    expect(created.name).toBe('Bamboo Works');
    expect(created.productCount).toBe(1);
  });

  it('creates the category under a chosen parent', async () => {
    const product = await submitWithProposals();
    const workspace = db().categories.find((c) => c.slug === 'workspace')!;

    const { data } = await call<Product>(
      'POST',
      `/products/${product.id}/category`,
      {
        token: admin,
        body: {
          action: 'create',
          name: 'Risers',
          slug: 'risers',
          parentId: workspace.id,
        },
      },
    );

    expect(data.categoryId).not.toBeNull();
    const categories = await call<Category[]>('GET', '/categories');
    expect(categories.data.find((c) => c.slug === 'risers')?.parentId).toBe(
      workspace.id,
    );
  });

  it('attaches an entry that already exists under another name', async () => {
    // The common case: a seller writes "Northwind Furniture" when the catalog
    // already has "Northwind".
    const product = await submitWithProposals({
      proposedBrandName: 'Northwind Furniture',
    });
    const northwind = db().brands.find((b) => b.slug === 'northwind')!;

    const { data } = await call<Product>(
      'POST',
      `/products/${product.id}/brand`,
      { token: admin, body: { action: 'attach', id: northwind.id } },
    );

    expect(data.brandId).toBe(northwind.id);
    expect(data.proposedBrandName).toBeNull();

    const brands = await call<Brand[]>('GET', '/brands');
    // No near-duplicate was created.
    expect(
      brands.data.filter((b) => b.name.startsWith('Northwind')),
    ).toHaveLength(1);
  });

  it('dismisses a proposal, leaving the product without one', async () => {
    const product = await submitWithProposals();

    const { data } = await call<Product>(
      'POST',
      `/products/${product.id}/brand`,
      { token: admin, body: { action: 'dismiss' } },
    );

    expect(data.proposedBrandName).toBeNull();
    expect(data.brandId).toBeNull();
  });

  it('refuses a slug that is already taken', async () => {
    const product = await submitWithProposals();

    const { status } = await call('POST', `/products/${product.id}/brand`, {
      token: admin,
      body: { action: 'create', name: 'Clash', slug: 'northwind' },
    });

    expect(status).toBe(409);
  });

  it('refuses an unknown entry to attach', async () => {
    const product = await submitWithProposals();

    const { status } = await call('POST', `/products/${product.id}/brand`, {
      token: admin,
      body: {
        action: 'attach',
        id: '00000000-0000-4000-8000-000000000000',
      },
    });

    expect(status).toBe(404);
  });

  it('is closed to the seller who proposed it', async () => {
    const product = await submitWithProposals();

    const { status } = await call('POST', `/products/${product.id}/brand`, {
      token: seller,
      body: { action: 'create', name: 'Bamboo Works', slug: 'bamboo-works' },
    });

    expect(status).toBe(403);
  });

  it('rejects an unrecognised action', async () => {
    const product = await submitWithProposals();

    const { status } = await call('POST', `/products/${product.id}/brand`, {
      token: admin,
      body: { action: 'invent' },
    });

    expect(status).toBe(400);
  });
});
