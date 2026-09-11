import { describe, expect, it } from 'vitest';

import {
  getProductById,
  getRelatedProducts,
  productCategories,
} from './products';

describe('getProductById', () => {
  it('finds a product and attaches its category title', () => {
    const product = getProductById('na-1');

    expect(product?.name).toBe('Aria Wireless Earbuds');
    expect(product?.categoryTitle).toBe('New Arrivals');
  });

  it('returns undefined for an unknown id', () => {
    expect(getProductById('does-not-exist')).toBeUndefined();
  });
});

describe('getRelatedProducts', () => {
  it('returns other products from the same category, excluding itself', () => {
    const related = getRelatedProducts('na-1');

    expect(related.length).toBeGreaterThan(0);
    expect(related.every((product) => product.id !== 'na-1')).toBe(true);

    const newArrivals = productCategories.find(
      (category) => category.slug === 'new-arrivals',
    );
    expect(
      related.every((product) =>
        newArrivals?.products.some((p) => p.id === product.id),
      ),
    ).toBe(true);
  });

  it('respects the limit and returns nothing for an unknown id', () => {
    expect(getRelatedProducts('na-1', 2)).toHaveLength(2);
    expect(getRelatedProducts('does-not-exist')).toEqual([]);
  });
});
