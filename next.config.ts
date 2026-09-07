import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Design: non-local-request-guard.
    proxyClientMaxBodySize: '128kb',
  },
  // Framing would give a hostile page same-origin clicks the Origin check in src/proxy.ts
  // cannot see. Design: non-local-request-guard.
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
  ],
};

export default nextConfig;
