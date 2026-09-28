import type { Brand, Category } from '@/lib/catalog-types';

/** A top-level category with the sub-categories filed under it. */
export type CategoryBranch = {
  category: Category;
  /** Direct children only — the menu shows two levels, and a deeper
   * category is still reachable from its parent's listing. */
  children: Category[];
};

function byPosition(left: Category, right: Category): number {
  return left.position - right.position || left.name.localeCompare(right.name);
}

/**
 * Turns the API's flat category list into menu branches. A category whose
 * parent isn't in the list (deleted, or not yet visible) is treated as
 * top-level rather than dropped.
 */
export function buildCategoryTree(categories: Category[]): CategoryBranch[] {
  const ids = new Set(categories.map((category) => category.id));
  return categories
    .filter((category) => !category.parentId || !ids.has(category.parentId))
    .sort(byPosition)
    .map((category) => ({
      category,
      children: categories
        .filter((child) => child.parentId === category.id)
        .sort(byPosition),
    }));
}

export type BrandGroup = { letter: string; brands: Brand[] };

/** Brands under their first letter, A–Z; anything else goes under "#". */
export function groupBrandsByLetter(brands: Brand[]): BrandGroup[] {
  const groups = new Map<string, Brand[]>();
  for (const brand of [...brands].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const first = brand.name.trim().charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(first) ? first : '#';
    groups.set(letter, [...(groups.get(letter) ?? []), brand]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) =>
      left === '#' ? 1 : right === '#' ? -1 : left.localeCompare(right),
    )
    .map(([letter, entries]) => ({ letter, brands: entries }));
}
