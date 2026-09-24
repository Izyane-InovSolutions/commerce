import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps an ordinary in-app path', () => {
    expect(safeNext('/orders', '/')).toBe('/orders');
    expect(safeNext('/orders?page=2#top', '/')).toBe('/orders?page=2#top');
  });

  it('falls back when nothing usable was supplied', () => {
    expect(safeNext(null, '/')).toBe('/');
    expect(safeNext(undefined, '/')).toBe('/');
    expect(safeNext('', '/')).toBe('/');
    expect(safeNext(42, '/')).toBe('/');
  });

  it('refuses an absolute URL', () => {
    expect(safeNext('https://evil.example/login', '/')).toBe('/');
    expect(safeNext('http://evil.example', '/')).toBe('/');
  });

  it('refuses a protocol-relative URL', () => {
    // `//evil.example` inherits the current scheme and leaves the origin —
    // the case a lone `startsWith('/')` check lets straight through.
    expect(safeNext('//evil.example', '/')).toBe('/');
  });

  it('refuses a backslash protocol-relative URL', () => {
    // Some browsers normalise the backslash to a slash, making this leave the
    // origin as well.
    expect(safeNext('/\\evil.example', '/')).toBe('/');
  });

  it('returns the caller-chosen fallback, not a hardcoded one', () => {
    expect(safeNext('https://evil.example', '/account')).toBe('/account');
  });
});
