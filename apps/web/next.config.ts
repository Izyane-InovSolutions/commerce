import type { NextConfig } from 'next';

const DEFAULT_API_BASE_URL = 'http://localhost:3005/api/v1';

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

const apiOrigin = apiBaseUrl.replace(/\/api\/v1\/?$/, '');

const nextConfig: NextConfig = {
  transpilePackages: ['@commerce/api-client', '@commerce/contracts'],
  images: {
    // Next 16 refuses to optimise a local image whose src carries a query
    // string unless the pattern is declared, to stop the optimiser being
    // pointed at arbitrary URLs. Media URLs are signed per asset, so `search`
    // cannot be pinned to one exact value — but everything under this path is
    // served by the API's media route, which verifies the HMAC and expiry and
    // refuses anything else. An unsigned guess gets a 403, not an image.
    localPatterns: [{ pathname: '/api/v1/media/**' }],
  },
  async rewrites() {
    return [
      // The API signs media URLs relative to its own origin, so proxying that
      // prefix lets an <Image src> use one unchanged — same origin, no CORS,
      // and no need to rebuild the URL in every component that renders one.
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
