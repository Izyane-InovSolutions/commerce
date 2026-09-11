import {
  createBrandSchema,
  createCategorySchema,
  updateBrandSchema,
  updateCategorySchema,
  type Brand,
  type Category,
} from '@commerce/contracts';

import { MockHttpError, parseBody } from './http.ts';
import { id } from './id.ts';
import { db } from './store.ts';
import type { Route } from './types.ts';

/**
 * Categories and brands.
 *
 * Reads are public because the storefront needs them to build navigation.
 * Writes are administrative: the taxonomy is shared by every seller, so
 * letting one seller invent entries would make it unusable for the rest.
 */

function countProductsInCategory(categoryId: string): number {
  return db().products.filter((product) => product.categoryId === categoryId)
    .length;
}

function countProductsWithBrand(brandId: string): number {
  return db().products.filter((product) => product.brandId === brandId).length;
}

/** Categories with their usage, parents before children, then alphabetical. */
function categoriesWithUsage(): Category[] {
  const withCounts = db().categories.map((category) => ({
    ...category,
    productCount: countProductsInCategory(category.id),
  }));

  const nameOf = new Map(withCounts.map((c) => [c.id, c.name]));
  return withCounts.sort((left, right) => {
    const leftKey = left.parentId
      ? `${nameOf.get(left.parentId) ?? ''}/${left.name}`
      : left.name;
    const rightKey = right.parentId
      ? `${nameOf.get(right.parentId) ?? ''}/${right.name}`
      : right.name;
    return leftKey.localeCompare(rightKey);
  });
}

function brandsWithUsage(): Brand[] {
  return db()
    .brands.map((brand) => ({
      ...brand,
      productCount: countProductsWithBrand(brand.id),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function findCategory(categoryId: string): Category {
  const category = db().categories.find(
    (candidate) => candidate.id === categoryId,
  );
  if (!category) {
    throw new MockHttpError(404, `No category with id ${categoryId}.`);
  }
  return category;
}

function findBrand(brandId: string): Brand {
  const brand = db().brands.find((candidate) => candidate.id === brandId);
  if (!brand) {
    throw new MockHttpError(404, `No brand with id ${brandId}.`);
  }
  return brand;
}

function assertSlugFree(
  kind: 'category' | 'brand',
  slug: string,
  exceptId?: string,
): void {
  const existing =
    kind === 'category'
      ? db().categories
      : (db().brands as { id: string; slug: string }[]);

  if (existing.some((entry) => entry.slug === slug && entry.id !== exceptId)) {
    throw new MockHttpError(409, `The slug ${slug} is already in use.`);
  }
}

/** Every category beneath one, so a move cannot create a loop. */
function descendantsOf(categoryId: string): Set<string> {
  const found = new Set<string>();
  let frontier = [categoryId];

  while (frontier.length > 0) {
    const children = db().categories.filter(
      (candidate) =>
        candidate.parentId !== null && frontier.includes(candidate.parentId),
    );
    frontier = [];
    for (const child of children) {
      if (!found.has(child.id)) {
        found.add(child.id);
        frontier.push(child.id);
      }
    }
  }

  return found;
}

function assertParentUsable(categoryId: string, parentId: string | null): void {
  if (parentId === null) {
    return;
  }

  if (parentId === categoryId) {
    throw new MockHttpError(409, 'A category cannot be its own parent.');
  }

  findCategory(parentId);

  if (descendantsOf(categoryId).has(parentId)) {
    throw new MockHttpError(
      409,
      'That would put the category inside one of its own children.',
    );
  }
}

export const taxonomyRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/categories',
    auth: 'public',
    handle: () => categoriesWithUsage(),
  },

  {
    method: 'POST',
    pattern: '/categories',
    auth: ['admin'],
    handle: ({ body }) => {
      const input = parseBody(createCategorySchema, body);
      assertSlugFree('category', input.slug);
      if (input.parentId !== null) {
        findCategory(input.parentId);
      }

      const category: Category = {
        id: id(`category:${input.slug}`),
        name: input.name,
        slug: input.slug,
        parentId: input.parentId,
        productCount: 0,
      };

      db().categories.push(category);
      return category;
    },
  },

  {
    method: 'PATCH',
    pattern: '/categories/:id',
    auth: ['admin'],
    handle: ({ params, body }) => {
      const category = findCategory(params.id!);
      const input = parseBody(updateCategorySchema, body);

      if (input.slug !== undefined) {
        assertSlugFree('category', input.slug, category.id);
        category.slug = input.slug;
      }
      if (input.name !== undefined) category.name = input.name;
      if (input.parentId !== undefined) {
        assertParentUsable(category.id, input.parentId);
        category.parentId = input.parentId;
      }

      return {
        ...category,
        productCount: countProductsInCategory(category.id),
      };
    },
  },

  {
    method: 'DELETE',
    pattern: '/categories/:id',
    auth: ['admin'],
    handle: ({ params }) => {
      const category = findCategory(params.id!);

      // Refused rather than cascaded: silently re-parenting someone else's
      // products or sub-categories is not a decision an API should make.
      const children = db().categories.filter(
        (candidate) => candidate.parentId === category.id,
      );
      if (children.length > 0) {
        throw new MockHttpError(
          409,
          `Move or remove the ${children.length} sub-categories first.`,
        );
      }

      const used = countProductsInCategory(category.id);
      if (used > 0) {
        throw new MockHttpError(
          409,
          `${used} product${used === 1 ? '' : 's'} still use this category.`,
        );
      }

      const store = db();
      store.categories = store.categories.filter(
        (candidate) => candidate.id !== category.id,
      );
      return new Response(null, { status: 204 });
    },
  },

  {
    method: 'GET',
    pattern: '/brands',
    auth: 'public',
    handle: () => brandsWithUsage(),
  },

  {
    method: 'POST',
    pattern: '/brands',
    auth: ['admin'],
    handle: ({ body }) => {
      const input = parseBody(createBrandSchema, body);
      assertSlugFree('brand', input.slug);

      const brand: Brand = {
        id: id(`brand:${input.slug}`),
        name: input.name,
        slug: input.slug,
        productCount: 0,
      };

      db().brands.push(brand);
      return brand;
    },
  },

  {
    method: 'PATCH',
    pattern: '/brands/:id',
    auth: ['admin'],
    handle: ({ params, body }) => {
      const brand = findBrand(params.id!);
      const input = parseBody(updateBrandSchema, body);

      if (input.slug !== undefined) {
        assertSlugFree('brand', input.slug, brand.id);
        brand.slug = input.slug;
      }
      if (input.name !== undefined) brand.name = input.name;

      return { ...brand, productCount: countProductsWithBrand(brand.id) };
    },
  },

  {
    method: 'DELETE',
    pattern: '/brands/:id',
    auth: ['admin'],
    handle: ({ params }) => {
      const brand = findBrand(params.id!);

      const used = countProductsWithBrand(brand.id);
      if (used > 0) {
        throw new MockHttpError(
          409,
          `${used} product${used === 1 ? '' : 's'} still carry this brand.`,
        );
      }

      const store = db();
      store.brands = store.brands.filter(
        (candidate) => candidate.id !== brand.id,
      );
      return new Response(null, { status: 204 });
    },
  },
];
