import Form from 'next/form';
import Link from 'next/link';
import { ArrowUpDown, Search, SlidersHorizontal, Tag, X } from 'lucide-react';

import { Pagination } from '@/components/pagination';
import { ProductCard } from '@/components/product-card';
import { SelectNavigation } from '@/components/select-navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Brand, Category, Product } from '@/lib/catalog-types';
import {
  CATALOG_SORTS,
  DEFAULT_CATALOG_SORT,
  catalogHref,
  toggleAttribute,
  type AttributeFacet,
  type CatalogParams,
} from '@/lib/catalog-query';
import { cn } from '@/lib/utils';

export type StorefrontCatalogProps = {
  /** One page of results, already filtered and sorted by the API. */
  products: Product[];
  total: number;
  pageSize: number;
  params: CatalogParams;
  categories: Category[];
  brands?: Brand[];
  /** Offered only once a category is chosen — see `collectAttributeFacets`. */
  facets?: AttributeFacet[];
  /** Products currently among the best sellers, badged as such. */
  bestSellerIds?: string[];
  title?: string;
  description?: string;
  /** Where filter links point — the homepage shows page 1 of the catalog
   * but sends every refinement to `/products`. */
  basePath?: string;
};

const pillClasses =
  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all';
const pillSelected = 'bg-primary text-primary-foreground shadow-xs';
const pillIdle =
  'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground';

/**
 * The browsable product catalog: category pills, brand and attribute
 * filters, sort, search-within, and page links.
 *
 * All of it is URL state applied by `GET /catalog/products` — every control
 * here is a link (or a GET form) to the same listing with one thing changed,
 * so results are always a real page of the whole catalog rather than a
 * client-side reshuffle of whatever happened to be loaded.
 */
export function StorefrontCatalog({
  products,
  total,
  pageSize,
  params,
  categories,
  brands = [],
  facets = [],
  bestSellerIds = [],
  title = 'Explore Products',
  description,
  basePath = '/products',
}: StorefrontCatalogProps) {
  const href = (changes: Partial<CatalogParams>) =>
    catalogHref(params, changes, basePath);
  const clearAll = catalogHref(
    { attributes: [], sort: DEFAULT_CATALOG_SORT, page: 1 },
    {},
    basePath,
  );
  const bestSellers = new Set(bestSellerIds);
  const selectedBrand = brands.find((brand) => brand.slug === params.brand);
  const selectedValues = new Map(
    facets.flatMap((facet) =>
      facet.values.map((value) => [value.id, `${facet.name}: ${value.value}`]),
    ),
  );
  const hasActiveFilters =
    params.category !== undefined ||
    params.brand !== undefined ||
    params.attributes.length > 0 ||
    params.q !== undefined ||
    params.sort !== DEFAULT_CATALOG_SORT;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <Badge variant="secondary" className="font-mono text-xs">
              {total} {total === 1 ? 'item' : 'items'}
            </Badge>
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          ) : null}
        </div>

        {/* Search within — a GET form, so the other filters ride along as
            hidden fields and the API does the matching. */}
        <Form action={basePath} className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          {params.category ? (
            <input type="hidden" name="category" value={params.category} />
          ) : null}
          {params.brand ? (
            <input type="hidden" name="brand" value={params.brand} />
          ) : null}
          {params.attributes.map((id) => (
            <input key={id} type="hidden" name="attr" value={id} />
          ))}
          {params.sort !== DEFAULT_CATALOG_SORT ? (
            <input type="hidden" name="sort" value={params.sort} />
          ) : null}
          <label htmlFor="catalog-search" className="sr-only">
            Search within products
          </label>
          <Input
            id="catalog-search"
            type="search"
            name="q"
            placeholder="Search within products..."
            defaultValue={params.q ?? ''}
            className="pl-9 h-9 text-sm"
          />
        </Form>
      </div>

      {/* Category Pills Bar */}
      <nav
        aria-label="Categories"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
      >
        <Link
          href={href({ category: undefined, attributes: [] })}
          aria-current={params.category === undefined ? 'true' : undefined}
          className={cn(
            pillClasses,
            params.category === undefined ? pillSelected : pillIdle,
          )}
        >
          All Categories
        </Link>
        {categories.map((category) => {
          const isSelected = params.category === category.slug;
          return (
            <Link
              key={category.id}
              // Attribute values belong to the category they were picked
              // from, so switching category drops them.
              href={href({ category: category.slug, attributes: [] })}
              aria-current={isSelected ? 'true' : undefined}
              className={cn(pillClasses, isSelected ? pillSelected : pillIdle)}
            >
              {category.name}
            </Link>
          );
        })}
      </nav>

      {/* Filter & Sort Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-3 shadow-xs">
        {brands.length > 0 ? (
          <SelectNavigation
            id="catalog-brand"
            label={
              <>
                <Tag className="size-3.5" /> Brand:
              </>
            }
            value={params.brand ?? ''}
            options={[
              { value: '', label: 'All brands', href: href({ brand: undefined }) },
              ...brands.map((brand) => ({
                value: brand.slug,
                label: brand.name,
                href: href({ brand: brand.slug }),
              })),
            ]}
          />
        ) : null}

        <div className="flex items-center gap-2 ml-auto">
          <SelectNavigation
            id="catalog-sort"
            label={
              <>
                <ArrowUpDown className="size-3.5" /> Sort by:
              </>
            }
            value={params.sort}
            options={CATALOG_SORTS.map((sort) => ({
              value: sort.value,
              label: sort.label,
              href: href({ sort: sort.value }),
            }))}
          />

          {hasActiveFilters ? (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link href={clearAll}>Reset</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Attribute facets — only for a chosen category */}
      {facets.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <SlidersHorizontal className="size-3.5" /> Refine (matches any
            selected option):
          </p>
          <div className="space-y-2">
            {facets.map((facet) => (
              <div
                key={facet.attributeId}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="text-xs font-medium mr-1">{facet.name}</span>
                {facet.values.map((value) => {
                  const isSelected = params.attributes.includes(value.id);
                  return (
                    <Link
                      key={value.id}
                      href={href({
                        attributes: toggleAttribute(params.attributes, value.id),
                      })}
                      aria-pressed={isSelected}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:border-foreground/40',
                      )}
                    >
                      {value.value}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Active Filter Indicators */}
      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Active filters:</span>
          {params.category ? (
            <FilterChip
              label={`Category: ${
                categories.find((category) => category.slug === params.category)
                  ?.name ?? params.category
              }`}
              removeHref={href({ category: undefined, attributes: [] })}
              removeLabel="Remove category filter"
            />
          ) : null}
          {params.brand ? (
            <FilterChip
              label={`Brand: ${selectedBrand?.name ?? params.brand}`}
              removeHref={href({ brand: undefined })}
              removeLabel="Remove brand filter"
            />
          ) : null}
          {params.attributes.map((id) => (
            <FilterChip
              key={id}
              label={selectedValues.get(id) ?? 'Option'}
              removeHref={href({ attributes: toggleAttribute(params.attributes, id) })}
              removeLabel="Remove option filter"
            />
          ))}
          {params.q ? (
            <FilterChip
              label={`Search: “${params.q}”`}
              removeHref={href({ q: undefined })}
              removeLabel="Clear search"
            />
          ) : null}
          {params.sort !== DEFAULT_CATALOG_SORT ? (
            <Badge variant="outline" className="gap-1 py-0.5 text-xs font-normal">
              Sorted:{' '}
              {CATALOG_SORTS.find((sort) => sort.value === params.sort)?.label}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {/* Products Grid */}
      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              badge={bestSellers.has(product.id) ? '🔥 Best seller' : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
          <p className="text-base font-semibold">
            {params.page > 1 && total > 0
              ? 'This page is past the end of the results'
              : 'No products match your criteria'}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {params.page > 1 && total > 0
              ? 'Go back to the first page of results.'
              : 'Try adjusting your category selection, search terms, or active filters.'}
          </p>
          <Button variant="outline" size="sm" asChild className="mt-4">
            <Link href={params.page > 1 && total > 0 ? href({}) : clearAll}>
              {params.page > 1 && total > 0 ? 'First page' : 'Clear all filters'}
            </Link>
          </Button>
        </div>
      )}

      <Pagination
        label="Product pages"
        page={params.page}
        total={total}
        limit={pageSize}
        hrefForPage={(page) => href({ page })}
      />
    </div>
  );
}

function FilterChip({
  label,
  removeHref,
  removeLabel,
}: {
  label: string;
  removeHref: string;
  removeLabel: string;
}) {
  return (
    <Badge variant="outline" className="gap-1 py-0.5 text-xs font-normal">
      {label}
      <Link
        href={removeHref}
        className="hover:text-foreground"
        aria-label={removeLabel}
      >
        <X className="size-3" />
      </Link>
    </Badge>
  );
}
