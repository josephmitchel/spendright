import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // src/proxy.ts makes Next buffer every request body (10MB default), and
    // /api/webhook is internet-reachable; nothing this app accepts is more
    // than a few KB, so cap the buffer. An oversized body is truncated, which
    // fails webhook verification closed (hash mismatch -> 401).
    // Design: webhook-jwt-verification.
    proxyClientMaxBodySize: '128kb',
  },
  // The app must never render inside a frame: a hostile page iframing
  // http://localhost:3000 gets same-origin clicks inside the frame, which the
  // Origin check in src/proxy.ts cannot see. Design: non-local-request-guard.
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
