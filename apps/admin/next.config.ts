import type { NextConfig } from 'next';

const DEFAULT_API_BASE_URL = 'http://localhost:3005/api/v1';

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

// Derives the base origin (e.g. 'http://localhost:3005') without the trailing '/api/v1'
const apiOrigin = apiBaseUrl.replace(/\/api\/v1\/?$/, '');

const nextConfig: NextConfig = {
  transpilePackages: ['@commerce/api-client', '@commerce/contracts'],
  async rewrites() {
    return [
      // Direct pass-through for versioned API calls: /api/v1/... -> http://localhost:3005/api/v1/...
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
      // Swagger documentation UI & OpenAPI schemas: /api/docs and /api/docs/...
      {
        source: '/api/docs',
        destination: `${apiOrigin}/api/docs`,
      },
      {
        source: '/api/docs/:path*',
        destination: `${apiOrigin}/api/docs/:path*`,
      },
      // Shorthand endpoint alias: /api/... -> http://localhost:3005/api/v1/...
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

