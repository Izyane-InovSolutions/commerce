import { parsePage } from './pagination';

/**
 * The `/products` listing's URL state, and how it maps onto the API.
 *
 * Filtering, sorting and paging all happen in `GET /catalog/products` — the
 * page only reads its search params, forwards them, and builds links that
 * change one of them. Kept pure (no `next/*`, no API client) so both the
 * server page and the tests can use it.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The sorts `GET /catalog/products` actually honours: it only sorts on
 * `name` and `createdAt` (see `ProductsService.buildOrderBy`). Price isn't
 * sortable there — a product's price lives on its offers — so it isn't
 * offered here either, rather than faked by reordering one page.
 */
export const CATALOG_SORTS = [
  { value: 'newest', label: 'Newest first', api: 'createdAt:desc' },
  { value: 'oldest', label: 'Oldest first', api: 'createdAt:asc' },
  { value: 'name-asc', label: 'Name: A to Z', api: 'name:asc' },
  { value: 'name-desc', label: 'Name: Z to A', api: 'name:desc' },
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number]['value'];

/** The API's own default order, so it's left out of links. */
export const DEFAULT_CATALOG_SORT: CatalogSort = 'newest';

export const CATALOG_PAGE_SIZE = 24;

export type CatalogParams = {
  category?: string;
  brand?: string;
  /** Attribute value ids — the API matches a product carrying any of them. */
  attributes: string[];
  q?: string;
  sort: CatalogSort;
  page: number;
};

/** The API rejects anything but a v4 UUID here with a 400, so a hand-edited
 * or stale `?attr=` is dropped instead of breaking the whole page. */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function all(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isCatalogSort(value: string | undefined): value is CatalogSort {
  return CATALOG_SORTS.some((sort) => sort.value === value);
}

export function parseCatalogParams(params: SearchParams): CatalogParams {
  const sort = first(params.sort);
  const category = first(params.category);

  return {
    // `all` is what the old client-side filter wrote for "no category".
    category: category === 'all' ? undefined : category,
    brand: first(params.brand),
    attributes: [
      ...new Set(all(params.attr).filter((id) => UUID_V4.test(id))),
    ],
    q: first(params.q),
    // Older links carry sorts that no longer exist (`trending`,
    // `price-asc`); they read as the default rather than an error.
    sort: isCatalogSort(sort) ? sort : DEFAULT_CATALOG_SORT,
    page: parsePage(params.page),
  };
}

/**
 * Where an old `?filter=` link now lives. Trending and new arrivals used to
 * be client-side guesses on this page; they're their own measured pages now.
 */
export function legacyFilterRedirect(params: SearchParams): string | null {
  const filter = first(params.filter);
  if (filter === 'trending') return '/best-sellers';
  if (filter === 'new-arrivals') return '/new-arrivals';
  return null;
}

export function toApiSort(sort: CatalogSort): string {
  return (
    CATALOG_SORTS.find((entry) => entry.value === sort)?.api ??
    'createdAt:desc'
  );
}

/** The query `listProducts` sends for this URL state. */
export function toProductListQuery(
  params: CatalogParams,
  limit: number = CATALOG_PAGE_SIZE,
) {
  return {
    categorySlug: params.category,
    brandSlug: params.brand,
    attributeValueIds: params.attributes,
    q: params.q,
    sort: toApiSort(params.sort),
    page: params.page,
    limit,
  };
}

/**
 * A link to this listing with some of its state changed.
 *
 * Changing anything but the page itself goes back to page 1 — the old page
 * number means nothing once the result set is different. Defaults are left
 * out, so the plain listing is just `/products`.
 */
export function catalogHref(
  params: CatalogParams,
  changes: Partial<CatalogParams> = {},
  basePath = '/products',
): string {
  const next: CatalogParams = {
    ...params,
    ...changes,
    page: changes.page ?? 1,
  };
  const search = new URLSearchParams();

  if (next.category) search.set('category', next.category);
  if (next.brand) search.set('brand', next.brand);
  for (const id of next.attributes) search.append('attr', id);
  if (next.q) search.set('q', next.q);
  if (next.sort !== DEFAULT_CATALOG_SORT) search.set('sort', next.sort);
  if (next.page > 1) search.set('page', String(next.page));

  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** `attributes` with `id` added, or removed if it was already there. */
export function toggleAttribute(attributes: string[], id: string): string[] {
  return attributes.includes(id)
    ? attributes.filter((existing) => existing !== id)
    : [...attributes, id];
}

export type AttributeFacet = {
  attributeId: string;
  name: string;
  values: { id: string; value: string }[];
};

/**
 * The attribute values a set of products actually carries, grouped by
 * attribute — the API has no public endpoint listing a category's
 * attributes, so the listing derives its "refine by" options from a sample
 * of the category's own products instead.
 */
export function collectAttributeFacets(
  products: {
    variants: {
      attributes?: {
        attributeId: string;
        attributeName: string;
        valueId: string;
        value: string;
      }[];
    }[];
  }[],
): AttributeFacet[] {
  const byAttribute = new Map<
    string,
    { name: string; values: Map<string, string> }
  >();

  for (const product of products) {
    for (const variant of product.variants) {
      for (const entry of variant.attributes ?? []) {
        const facet = byAttribute.get(entry.attributeId) ?? {
          name: entry.attributeName,
          values: new Map<string, string>(),
        };
        facet.values.set(entry.valueId, entry.value);
        byAttribute.set(entry.attributeId, facet);
      }
    }
  }

  return [...byAttribute.entries()]
    .map(([attributeId, facet]) => ({
      attributeId,
      name: facet.name,
      values: [...facet.values.entries()]
        .map(([id, value]) => ({ id, value }))
        .sort((left, right) =>
          left.value.localeCompare(right.value, undefined, { numeric: true }),
        ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
