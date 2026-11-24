import type { NextConfig } from 'next';

const rawApiOrigin = process.env.INTERNAL_API_URL || 'http://127.0.0.1:4000';
const internalApiOrigin = /^https?:\/\//i.test(rawApiOrigin) ? rawApiOrigin : `http://${rawApiOrigin}`;

const nextConfig: NextConfig = {
  transpilePackages: ['@erp/shared'],
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${internalApiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
