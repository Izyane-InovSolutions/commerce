import type { Brand, Category } from '@commerce/contracts';
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

function categoryBySlug(slug: string): Category {
  return db().categories.find((c) => c.slug === slug)!;
}

describe('reading the taxonomy', () => {
  it('is public, because the storefront builds navigation from it', async () => {
    expect((await call('GET', '/categories')).status).toBe(200);
    expect((await call('GET', '/brands')).status).toBe(200);
  });

  it('reports how many products use each entry', async () => {
    const brands = await call<Brand[]>('GET', '/brands');
    const northwind = brands.data.find((b) => b.slug === 'northwind')!;

    expect(northwind.productCount).toBe(
      db().products.filter((p) => p.brandId === northwind.id).length,
    );
    expect(northwind.productCount).toBeGreaterThan(0);
  });

  it('lists sub-categories under their parent', async () => {
    const { data } = await call<Category[]>('GET', '/categories');
    const slugs = data.map((c) => c.slug);

    expect(slugs.indexOf('workspace')).toBeLessThan(slugs.indexOf('desks'));
    expect(slugs.indexOf('workspace')).toBeLessThan(slugs.indexOf('seating'));
  });
});

describe('writing the taxonomy', () => {
  it('is closed to sellers', async () => {
    expect(
      (
        await call('POST', '/brands', {
          token: seller,
          body: { name: 'Deskworks Own', slug: 'deskworks-own' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('POST', '/categories', {
          token: seller,
          body: { name: 'Mats', slug: 'mats' },
        })
      ).status,
    ).toBe(403);
  });

  it('needs a session at all', async () => {
    expect(
      (await call('POST', '/brands', { body: { name: 'X', slug: 'x' } }))
        .status,
    ).toBe(401);
  });

  it('creates a brand', async () => {
    const { status, data } = await call<Brand>('POST', '/brands', {
      token: admin,
      body: { name: 'Fenwick', slug: 'fenwick' },
    });

    expect(status).toBe(201);
    expect(data.name).toBe('Fenwick');
    expect(data.productCount).toBe(0);
  });

  it('creates a top-level category and a child of it', async () => {
    const parent = await call<Category>('POST', '/categories', {
      token: admin,
      body: { name: 'Storage', slug: 'storage' },
    });
    expect(parent.data.parentId).toBeNull();

    const child = await call<Category>('POST', '/categories', {
      token: admin,
      body: { name: 'Shelving', slug: 'shelving', parentId: parent.data.id },
    });
    expect(child.data.parentId).toBe(parent.data.id);
  });

  it('refuses a duplicate slug', async () => {
    expect(
      (
        await call('POST', '/brands', {
          token: admin,
          body: { name: 'Another', slug: 'northwind' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call('POST', '/categories', {
          token: admin,
          body: { name: 'Another', slug: 'desks' },
        })
      ).status,
    ).toBe(409);
  });

  it('refuses a slug that is not url safe', async () => {
    expect(
      (
        await call('POST', '/brands', {
          token: admin,
          body: { name: 'Bad', slug: 'Not A Slug' },
        })
      ).status,
    ).toBe(400);
  });

  it('refuses an unknown parent', async () => {
    expect(
      (
        await call('POST', '/categories', {
          token: admin,
          body: {
            name: 'Orphan',
            slug: 'orphan',
            parentId: '00000000-0000-4000-8000-000000000000',
          },
        })
      ).status,
    ).toBe(404);
  });

  it('renames without touching the parent', async () => {
    const desks = categoryBySlug('desks');
    const { data } = await call<Category>('PATCH', `/categories/${desks.id}`, {
      token: admin,
      body: { name: 'Desks & Benches' },
    });

    expect(data.name).toBe('Desks & Benches');
    // The trap this guards: a partial update must not reset parentId to null.
    expect(data.parentId).toBe(desks.parentId);
    expect(data.parentId).not.toBeNull();
  });

  it('moves a category to the top level when asked explicitly', async () => {
    const desks = categoryBySlug('desks');
    const { data } = await call<Category>('PATCH', `/categories/${desks.id}`, {
      token: admin,
      body: { parentId: null },
    });

    expect(data.parentId).toBeNull();
  });

  it('will not make a category its own parent', async () => {
    const desks = categoryBySlug('desks');
    const { status } = await call('PATCH', `/categories/${desks.id}`, {
      token: admin,
      body: { parentId: desks.id },
    });

    expect(status).toBe(409);
  });

  it('will not put a category inside its own child', async () => {
    const workspace = categoryBySlug('workspace');
    const desks = categoryBySlug('desks');

    const { status, data } = await call<{ message: string }>(
      'PATCH',
      `/categories/${workspace.id}`,
      { token: admin, body: { parentId: desks.id } },
    );

    expect(status).toBe(409);
    expect(data.message).toContain('inside one of its own children');
  });

  it('catches a loop several levels deep', async () => {
    const workspace = categoryBySlug('workspace');
    const desks = categoryBySlug('desks');

    const grandchild = await call<Category>('POST', '/categories', {
      token: admin,
      body: { name: 'Sit-stand', slug: 'sit-stand', parentId: desks.id },
    });

    const { status } = await call('PATCH', `/categories/${workspace.id}`, {
      token: admin,
      body: { parentId: grandchild.data.id },
    });

    expect(status).toBe(409);
  });
});

describe('deleting from the taxonomy', () => {
  it('deletes an unused brand', async () => {
    const created = await call<Brand>('POST', '/brands', {
      token: admin,
      body: { name: 'Unused', slug: 'unused' },
    });

    const { status } = await call('DELETE', `/brands/${created.data.id}`, {
      token: admin,
    });
    expect(status).toBe(204);

    const brands = await call<Brand[]>('GET', '/brands');
    expect(brands.data.some((b) => b.slug === 'unused')).toBe(false);
  });

  it('refuses to delete a brand products still carry', async () => {
    const brands = await call<Brand[]>('GET', '/brands');
    const inUse = brands.data.find((b) => b.productCount > 0)!;

    const { status, data } = await call<{ message: string }>(
      'DELETE',
      `/brands/${inUse.id}`,
      { token: admin },
    );

    expect(status).toBe(409);
    expect(data.message).toContain('still carry this brand');
  });

  it('refuses to delete a category with sub-categories', async () => {
    const workspace = categoryBySlug('workspace');
    const { status, data } = await call<{ message: string }>(
      'DELETE',
      `/categories/${workspace.id}`,
      { token: admin },
    );

    expect(status).toBe(409);
    expect(data.message).toContain('sub-categories');
  });

  it('refuses to delete a category products still use', async () => {
    const desks = categoryBySlug('desks');
    const { status, data } = await call<{ message: string }>(
      'DELETE',
      `/categories/${desks.id}`,
      { token: admin },
    );

    expect(status).toBe(409);
    expect(data.message).toContain('still use this category');
  });

  it('is closed to sellers', async () => {
    const created = await call<Brand>('POST', '/brands', {
      token: admin,
      body: { name: 'Temp', slug: 'temp' },
    });

    expect(
      (await call('DELETE', `/brands/${created.data.id}`, { token: seller }))
        .status,
    ).toBe(403);
  });
});
