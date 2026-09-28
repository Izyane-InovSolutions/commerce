import { describe, expect, it } from 'vitest';

import { appUrl } from './app-url';

describe('appUrl', () => {
  it('keeps the base path an app is served under', () => {
    expect(
      appUrl('http://localhost:3003/seller', '/auth/handoff').toString(),
    ).toBe('http://localhost:3003/seller/auth/handoff');
    expect(
      appUrl('https://shop.example/seller/', 'auth/handoff').toString(),
    ).toBe('https://shop.example/seller/auth/handoff');
  });

  it('works for an app served at the root', () => {
    expect(appUrl('http://localhost:3003', '/auth/handoff').toString()).toBe(
      'http://localhost:3003/auth/handoff',
    );
  });

  it('adds query parameters, encoded', () => {
    const url = appUrl('https://shop.example/seller', '/auth/handoff', {
      code: 'a b&c',
      next: '/apply',
    });

    expect(url.pathname).toBe('/seller/auth/handoff');
    expect(url.searchParams.get('code')).toBe('a b&c');
    expect(url.searchParams.get('next')).toBe('/apply');
  });
});
