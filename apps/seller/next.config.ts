import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Served under /seller on the shared Vercel origin; see src/lib/base-path.ts.
  basePath: '/seller',
  transpilePackages: ['@commerce/api-client', '@commerce/contracts'],
};

export default nextConfig;
