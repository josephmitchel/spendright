import { type NextRequest, NextResponse } from 'next/server';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

// cdn.plaid.com serves the Plaid Link script and iframe (kept for browsers
// that ignore 'strict-dynamic'); connect-src covers its telemetry and API
// calls. Dev-mode React needs eval() for debugging features (never in
// production), so 'unsafe-eval' is dev-only.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://cdn.plaid.com` +
      (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://cdn.plaid.com https://*.plaid.com",
    'frame-src https://cdn.plaid.com',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function headerHostname(hostHeader: string): string | null {
  // new URL() would parse "evil.com@localhost" or "localhost/evil" into a
  // loopback hostname, so illegal Host structure is refused before parsing.
  if (/[/\\@?#\s]/.test(hostHeader)) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

export function isSameOrigin(origin: string, hostHeader: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.host === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

export function isLoopbackIp(entry: string): boolean {
  const ip = entry.trim().replace(/^::ffff:/i, '');
  return ip === '::1' || ip === '[::1]' || /^127(\.\d{1,3}){3}$/.test(ip);
}

// Next fills x-forwarded-host/-for with ??= (Verified-on: next@16.3.4), so a
// forwarding proxy's values survive and must be checked.
export function isLocalRequest(req: { headers: Headers }): boolean {
  const host = req.headers.get('host');
  if (!host) return false;
  const hostname = headerHostname(host);
  if (!hostname || !LOCAL_HOSTNAMES.has(hostname)) return false;

  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const forwardedHostname = headerHostname(forwardedHost);
    if (!forwardedHostname || !LOCAL_HOSTNAMES.has(forwardedHostname)) return false;
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor && !forwardedFor.split(',').every(isLoopbackIp)) return false;

  return true;
}

export function proxy(req: NextRequest) {
  if (!isLocalRequest(req)) return new NextResponse(null, { status: 404 });

  // CSRF: Origin-bearing state changes must be same-origin; Origin-less pass.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (origin && (!host || !isSameOrigin(origin, host))) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Cross-origin requests are not allowed' } },
        { status: 403 },
      );
    }
  }

  // The nonce rides the request's CSP header so Next stamps it onto the
  // scripts it renders; the response carries the same policy to the browser.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  return response;
}
