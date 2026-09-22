import { describe, expect, it } from 'vitest';

import { ACCESS_COOKIE, REFRESH_COOKIE } from './session-cookie';

describe('session cookies', () => {
  it('are specific to this portal', () => {
    // Cookies ignore the port, so every client on localhost shares one jar.
    // Generic names here would let one portal's sign-in clobber another's,
    // making it impossible to be an admin in one tab and a seller in another.
    expect(ACCESS_COOKIE).toBe('commerce_seller_access');
    expect(REFRESH_COOKIE).toBe('commerce_seller_refresh');
  });

  it('keep the access and refresh tokens apart', () => {
    // The access cookie expires with its token, which is what makes
    // "access gone, refresh present" the signal to renew.
    expect(ACCESS_COOKIE).not.toBe(REFRESH_COOKIE);
  });
});
