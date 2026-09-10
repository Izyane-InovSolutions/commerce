import { randomBytes } from 'node:crypto';

// A guest cart token is not a security credential (unlike a session/reset
// token) — comparable in sensitivity to the cart-id cookie many storefronts
// use — so it's generated and stored the same way but never hashed at rest.
export function generateGuestToken(): string {
  return randomBytes(24).toString('base64url');
}
