import { describe, expect, it } from 'vitest';

import { sampleCategorySalesShares } from './sample-category-sales';

describe('sampleCategorySalesShares', () => {
  it('returns nothing for an empty catalog', () => {
    expect(sampleCategorySalesShares([])).toEqual([]);
  });

  it('keeps every category as its own slice when there are 5 or fewer', () => {
    const categories = [
      { slug: 'electronics', name: 'Electronics' },
      { slug: 'home', name: 'Home & Living' },
      { slug: 'outdoor', name: 'Outdoor & Apparel' },
    ];

    const shares = sampleCategorySalesShares(categories);

    expect(shares).toHaveLength(3);
    expect(shares.map((share) => share.category).sort()).toEqual(
      ['Electronics', 'Home & Living', 'Outdoor & Apparel'].sort(),
    );
  });

  it('folds categories past the top 4 into a single Other slice', () => {
    const categories = [
      { slug: 'a', name: 'A' },
      { slug: 'b', name: 'B' },
      { slug: 'c', name: 'C' },
      { slug: 'd', name: 'D' },
      { slug: 'e', name: 'E' },
      { slug: 'f', name: 'F' },
    ];

    const shares = sampleCategorySalesShares(categories);

    expect(shares).toHaveLength(5);
    expect(shares.at(-1)).toMatchObject({ category: 'Other', slug: 'other' });
  });

  it('is deterministic for the same input', () => {
    const categories = [
      { slug: 'electronics', name: 'Electronics' },
      { slug: 'home', name: 'Home & Living' },
    ];

    expect(sampleCategorySalesShares(categories)).toEqual(
      sampleCategorySalesShares(categories),
    );
  });
});
