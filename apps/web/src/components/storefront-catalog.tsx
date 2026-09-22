'use client';

import { useMemo, useState } from 'react';
import {
  Flame,
  Sparkles,
  SlidersHorizontal,
  Search,
  X,
  ArrowUpDown,
} from 'lucide-react';

import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { Category, Product } from '@/lib/catalog-types';
import { getDisplayPrice } from '@/lib/catalog-types';

export type StorefrontCatalogProps = {
  products: Product[];
  categories: Category[];
  initialCategory?: string;
  initialFilter?: string;
  initialSort?: string;
  initialQuery?: string;
  title?: string;
  description?: string;
};

type QuickFilter = 'all' | 'trending' | 'new-arrivals';
type SortOption =
  | 'trending'
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc';

function isTrendingProduct(product: Product): boolean {
  // Deterministic calculation: products with multiple variants/offers or matching pattern
  if (product.variants.length > 1) return true;
  const hash = product.id
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return hash % 2 === 0;
}

function isNewArrival(product: Product, index: number, total: number): boolean {
  if (index >= total - 6) return true;
  const hash = product.slug
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return hash % 3 === 0;
}

export function StorefrontCatalog({
  products,
  categories,
  initialCategory = 'all',
  initialFilter = 'all',
  initialSort = 'trending',
  initialQuery = '',
  title = 'Explore Products',
  description,
}: StorefrontCatalogProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<string>(initialCategory);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(
    (initialFilter === 'trending' || initialFilter === 'new-arrivals'
      ? initialFilter
      : 'all') as QuickFilter,
  );
  const [sortOption, setSortOption] = useState<SortOption>(
    (initialSort || 'trending') as SortOption,
  );
  const [searchQuery, setSearchQuery] = useState<string>(initialQuery);

  // Category product counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    for (const p of products) {
      if (p.category?.slug) {
        counts[p.category.slug] = (counts[p.category.slug] ?? 0) + 1;
      }
    }
    return counts;
  }, [products]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let list = [...products];

    // 1. Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category?.slug === selectedCategory);
    }

    // 2. Search query filter
    const query = searchQuery.trim().toLowerCase();
    if (query.length > 0) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.description?.toLowerCase().includes(query) ?? false) ||
          (p.category?.name.toLowerCase().includes(query) ?? false),
      );
    }

    // 3. Quick filter
    if (quickFilter === 'trending') {
      list = list.filter((p) => isTrendingProduct(p));
    } else if (quickFilter === 'new-arrivals') {
      list = list.filter((p, i) => isNewArrival(p, i, products.length));
    }

    // 4. Sort
    list.sort((a, b) => {
      if (sortOption === 'price-asc') {
        const priceA = getDisplayPrice(a)?.amount ?? Infinity;
        const priceB = getDisplayPrice(b)?.amount ?? Infinity;
        return priceA - priceB;
      }
      if (sortOption === 'price-desc') {
        const priceA = getDisplayPrice(a)?.amount ?? -Infinity;
        const priceB = getDisplayPrice(b)?.amount ?? -Infinity;
        return priceB - priceA;
      }
      if (sortOption === 'name-asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortOption === 'newest') {
        // Reversed catalog index as newest
        return 0;
      }
      // 'trending' sort: trending products first, then by name
      const trendA = isTrendingProduct(a) ? 1 : 0;
      const trendB = isTrendingProduct(b) ? 1 : 0;
      if (trendA !== trendB) {
        return trendB - trendA;
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [products, selectedCategory, searchQuery, quickFilter, sortOption]);

  const hasActiveFilters =
    selectedCategory !== 'all' ||
    quickFilter !== 'all' ||
    searchQuery.trim().length > 0 ||
    sortOption !== 'trending';

  const resetFilters = () => {
    setSelectedCategory('all');
    setQuickFilter('all');
    setSearchQuery('');
    setSortOption('trending');
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <Badge variant="secondary" className="font-mono text-xs">
              {filteredProducts.length}{' '}
              {filteredProducts.length === 1 ? 'item' : 'items'}
            </Badge>
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          ) : null}
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search within products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8 h-9 text-sm"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
            selectedCategory === 'all'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          All Categories
          <span className="text-[10px] opacity-75">
            ({categoryCounts.all ?? products.length})
          </span>
        </button>

        {categories.map((cat) => {
          const count = categoryCounts[cat.slug] ?? 0;
          const isSelected = selectedCategory === cat.slug;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.slug)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat.name}
              <span className="text-[10px] opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Filter & Sort Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-3 shadow-xs">
        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1 hidden sm:inline-flex items-center gap-1">
            <SlidersHorizontal className="size-3.5" /> Filter:
          </span>
          <Button
            type="button"
            variant={quickFilter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => setQuickFilter('all')}
          >
            All
          </Button>
          <Button
            type="button"
            variant={quickFilter === 'trending' ? 'secondary' : 'ghost'}
            size="sm"
            className={`h-8 text-xs font-medium ${
              quickFilter === 'trending'
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : ''
            }`}
            onClick={() => setQuickFilter('trending')}
          >
            <Flame className="size-3.5 text-amber-500 mr-1" />
            Trending
          </Button>
          <Button
            type="button"
            variant={quickFilter === 'new-arrivals' ? 'secondary' : 'ghost'}
            size="sm"
            className={`h-8 text-xs font-medium ${
              quickFilter === 'new-arrivals'
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : ''
            }`}
            onClick={() => setQuickFilter('new-arrivals')}
          >
            <Sparkles className="size-3.5 text-blue-500 mr-1" />
            New Arrivals
          </Button>
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-2 ml-auto">
          <label
            htmlFor="catalog-sort"
            className="text-xs font-medium text-muted-foreground flex items-center gap-1"
          >
            <ArrowUpDown className="size-3.5" /> Sort by:
          </label>
          <select
            id="catalog-sort"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-xs focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring"
          >
            <option value="trending">🔥 Trending</option>
            <option value="newest">✨ Newest Arrivals</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="name-asc">Name: A to Z</option>
          </select>

          {hasActiveFilters ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {/* Active Filter Indicators */}
      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Active filters:</span>
          {selectedCategory !== 'all' ? (
            <Badge
              variant="outline"
              className="gap-1 py-0.5 text-xs font-normal"
            >
              Category:{' '}
              {categories.find((c) => c.slug === selectedCategory)?.name ??
                selectedCategory}
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="hover:text-foreground"
                aria-label="Remove category filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          {quickFilter !== 'all' ? (
            <Badge
              variant="outline"
              className="gap-1 py-0.5 text-xs font-normal"
            >
              Filter:{' '}
              {quickFilter === 'trending' ? '🔥 Trending' : '✨ New Arrivals'}
              <button
                type="button"
                onClick={() => setQuickFilter('all')}
                className="hover:text-foreground"
                aria-label="Remove quick filter"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          {searchQuery ? (
            <Badge
              variant="outline"
              className="gap-1 py-0.5 text-xs font-normal"
            >
              Search: &ldquo;{searchQuery}&rdquo;
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ) : null}
          {sortOption !== 'trending' ? (
            <Badge
              variant="outline"
              className="gap-1 py-0.5 text-xs font-normal"
            >
              Sorted: {sortOption}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {/* Products Grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((product, index) => {
            const isTrend = isTrendingProduct(product);
            const isNew = isNewArrival(product, index, products.length);
            const badge = isTrend
              ? '🔥 Trending'
              : isNew
                ? '✨ New'
                : undefined;

            return (
              <ProductCard key={product.id} product={product} badge={badge} />
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center">
          <p className="text-base font-semibold">
            No products match your criteria
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Try adjusting your category selection, search terms, or active
            filters.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetFilters}
            className="mt-4"
          >
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
