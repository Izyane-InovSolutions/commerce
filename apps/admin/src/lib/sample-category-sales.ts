export type CategorySalesShare = {
  category: string;
  slug: string;
  value: number;
};

const OTHER_SLUG = 'other';
const MAX_SLICES = 5;

/**
 * Sample best-selling-category shares for the overview page's pie chart.
 *
 * There is no sales-by-category reporting endpoint yet — orders aren't
 * attributed to categories anywhere in the read models — so this ranks the
 * real categories the catalog has and hands each a deterministic, clearly
 * sample share. Swap this out once that endpoint exists. Categories past the
 * top few are folded into "Other", the way a real chart would handle a long
 * tail.
 */
export function sampleCategorySalesShares(
  categories: { slug: string; name: string }[],
): CategorySalesShare[] {
  if (categories.length === 0) {
    return [];
  }

  const weighted = categories
    .map((category, index) => ({
      category: category.name,
      slug: category.slug,
      value: Math.round(100 / (index + 1.6) + ((index * 37) % 13)),
    }))
    .sort((a, b) => b.value - a.value);

  if (weighted.length <= MAX_SLICES) {
    return weighted;
  }

  const top = weighted.slice(0, MAX_SLICES - 1);
  const rest = weighted.slice(MAX_SLICES - 1);
  const otherValue = rest.reduce((sum, item) => sum + item.value, 0);

  return [...top, { category: 'Other', slug: OTHER_SLUG, value: otherValue }];
}
