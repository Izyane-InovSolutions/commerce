import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@commerce/api-client', '@commerce/contracts'],
};

export default nextConfig;
