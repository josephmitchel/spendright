import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Design: non-local-request-guard.
    proxyClientMaxBodySize: '128kb',
  },
  // Framing would give a hostile page same-origin clicks the Origin check in src/proxy.ts
  // cannot see; the rest of the CSP contains any script that ever slips in.
  // cdn.plaid.com serves the Plaid Link script and iframe; connect-src covers
  // its telemetry and API calls. Dev-mode React needs eval() for debugging
  // features (never in production), so 'unsafe-eval' is dev-only.
  // Design: non-local-request-guard.
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.plaid.com" +
              (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self' https://cdn.plaid.com https://*.plaid.com",
            'frame-src https://cdn.plaid.com',
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    },
  ],
};

export default nextConfig;
