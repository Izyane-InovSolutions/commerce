import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { parseRecentViews, rankInterests } from './recent-views-cookie';

describe('parseRecentViews', () => {
  it('reads an encoded cookie value', () => {
    const raw = encodeURIComponent(
      JSON.stringify([
        { s: 'iphone', c: 'phones' },
        { s: 'mug', c: null },
      ]),
    );
    expect(parseRecentViews(raw)).toEqual([
      { s: 'iphone', c: 'phones' },
      { s: 'mug', c: null },
    ]);
  });

  it('treats a missing or malformed cookie as no history', () => {
    expect(parseRecentViews(undefined)).toEqual([]);
    expect(parseRecentViews('%%%')).toEqual([]);
    expect(parseRecentViews(encodeURIComponent('{"s":1}'))).toEqual([]);
    expect(
      parseRecentViews(encodeURIComponent(JSON.stringify([{ s: 2, c: 'x' }]))),
    ).toEqual([]);
  });
});

describe('rankInterests', () => {
  it('ranks by views, ties to the most recent, skipping uncategorised', () => {
    expect(
      rankInterests([
        { s: 'a', c: 'shoes' },
        { s: 'b', c: 'phones' },
        { s: 'c', c: null },
        { s: 'd', c: 'phones' },
        { s: 'e', c: 'hats' },
        { s: 'f', c: 'shoes' },
      ]),
    ).toEqual(['shoes', 'phones', 'hats']);
  });
});
