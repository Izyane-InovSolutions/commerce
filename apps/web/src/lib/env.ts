const DEFAULT_API_BASE_URL = 'http://localhost:3005/api/v1';
const DEFAULT_SELLER_APP_URL = 'http://localhost:3003';

/**
 * Public runtime configuration.
 *
 * Only `NEXT_PUBLIC_*` variables are readable in the browser, and Next.js
 * inlines them at build time, so they must be referenced by their full literal
 * name rather than through a computed lookup.
 */
export const env = {
  apiBaseUrl: (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL
  ).replace(/\/+$/, ''),
  /** Where the seller portal (apps/seller) is served — the "Seller
   * dashboard" button hands the signed-in session off there. */
  sellerAppUrl: (
    process.env.NEXT_PUBLIC_SELLER_APP_URL ?? DEFAULT_SELLER_APP_URL
  ).replace(/\/+$/, ''),
} as const;
