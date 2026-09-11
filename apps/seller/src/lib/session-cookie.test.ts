import { describe, expect, it } from 'vitest';

import { SESSION_COOKIE } from './session-cookie';

describe('SESSION_COOKIE', () => {
  it('is specific to this portal', () => {
    // Cookies ignore the port, so every client on localhost shares one jar.
    // A generic name here would let one portal's sign-in clobber another's,
    // making it impossible to be an admin in one tab and a seller in another.
    expect(SESSION_COOKIE).toBe('commerce_seller_session');
  });
});
