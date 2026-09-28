import type { ConfigService } from '@nestjs/config';

import { absoluteAppUrl, DEFAULT_SELLER_APP_URL } from './app-links';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('absoluteAppUrl', () => {
  it('keeps the seller app base path when joining a link', () => {
    expect(
      absoluteAppUrl(
        config({ SELLER_APP_URL: 'https://example.com/seller' }),
        'seller',
        '/orders/so-1',
      ),
    ).toBe('https://example.com/seller/orders/so-1');
  });

  it('defaults the seller app to its /seller base path', () => {
    expect(DEFAULT_SELLER_APP_URL).toBe('http://localhost:3003/seller');
    expect(absoluteAppUrl(config({}), 'seller', '/orders/so-1')).toBe(
      'http://localhost:3003/seller/orders/so-1',
    );
  });

  it('collapses duplicate slashes at the join', () => {
    expect(
      absoluteAppUrl(
        config({ WEB_APP_URL: 'https://shop.example.com/' }),
        'customer',
        'orders/o-1',
      ),
    ).toBe('https://shop.example.com/orders/o-1');
  });
});
