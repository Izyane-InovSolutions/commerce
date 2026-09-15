import { beforeEach, describe, expect, it } from 'vitest';

import { getRecentlyViewed, recordProductView } from './recently-viewed';

describe('recently-viewed', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is empty with nothing recorded', () => {
    expect(getRecentlyViewed()).toEqual([]);
  });

  it('records a view and reads it back', () => {
    recordProductView({
      id: 'p1',
      slug: 'widget',
      name: 'Widget',
      imageUrl: null,
      price: { amount: 1000, currency: 'ZMW' },
    });

    const items = getRecentlyViewed();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'p1', slug: 'widget', name: 'Widget' });
    expect(typeof items[0]?.viewedAt).toBe('number');
  });

  it('moves a re-viewed product back to the front instead of duplicating it', () => {
    recordProductView({ id: 'p1', slug: 'a', name: 'A', imageUrl: null, price: null });
    recordProductView({ id: 'p2', slug: 'b', name: 'B', imageUrl: null, price: null });
    recordProductView({ id: 'p1', slug: 'a', name: 'A', imageUrl: null, price: null });

    const items = getRecentlyViewed();
    expect(items.map((item) => item.id)).toEqual(['p1', 'p2']);
  });

  it('caps the list at 12 entries, dropping the oldest', () => {
    for (let index = 0; index < 14; index += 1) {
      recordProductView({
        id: `p${index}`,
        slug: `product-${index}`,
        name: `Product ${index}`,
        imageUrl: null,
        price: null,
      });
    }

    const items = getRecentlyViewed();
    expect(items).toHaveLength(12);
    expect(items[0]?.id).toBe('p13');
    expect(items.map((item) => item.id)).not.toContain('p0');
    expect(items.map((item) => item.id)).not.toContain('p1');
  });

  it('ignores malformed stored data rather than throwing', () => {
    window.localStorage.setItem('commerce:recently-viewed', '{not json');
    expect(getRecentlyViewed()).toEqual([]);

    window.localStorage.setItem('commerce:recently-viewed', '"just a string"');
    expect(getRecentlyViewed()).toEqual([]);
  });
});
