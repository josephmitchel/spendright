import { type NextRequest, NextResponse } from 'next/server';

// Defense-in-depth over the loopback bind: every path refuses any request
// that did not arrive from loopback, with no exceptions.
// Design: non-local-request-guard, single-user-localhost-no-auth,
// scheduled-sync.

// IPv6 loopback appears only bracketed: URL.hostname keeps the brackets, and
// an unbracketed ::1 in a Host header does not parse at all.
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function headerHostname(hostHeader: string): string | null {
  // new URL() would parse "evil.com@localhost" or "localhost/evil" into a
  // loopback hostname, so structure a Host header cannot legally carry is
  // refused before parsing.
  if (/[/\\@?#\s]/.test(hostHeader)) return null;
  try {
    // URL handles [::1]:3000 and bare hosts alike.
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

// Same-origin means scheme, host, and port all match the request's own Host;
// merely-local is not enough (another dev server on some other port is a
// different origin).
function isSameOrigin(origin: string, hostHeader: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.host === hostHeader.toLowerCase();
  } catch {
    // Covers the literal Origin "null" (sandboxed frames) — refused.
    return false;
  }
}

function isLoopbackIp(entry: string): boolean {
  const ip = entry.trim().replace(/^::ffff:/i, '');
  return ip === '::1' || ip === '[::1]' || /^127(\.\d{1,3}){3}$/.test(ip);
}

// Next fills x-forwarded-host/-for itself but with ??= (Verified-on:
// next@16.3.4), so a forwarding proxy's values survive. Only an
// x-forwarded-for chain that is loopback end-to-end is local.
function isLocalRequest(req: NextRequest): boolean {
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
  // A uniform bodyless 404 tells a scanner nothing. `next dev`'s /__nextjs_*
  // endpoints are served before the proxy runs and bypass this check.
  if (!isLocalRequest(req)) return new NextResponse(null, { status: 404 });

  // CSRF: a state-changing request bearing an Origin must be same-origin
  // with the request itself; Origin-less requests (curl) pass.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (origin && (!host || !isSameOrigin(origin, host))) {
      // The jsonError envelope, inlined: proxy code should not rely on
      // shared modules (Verified-on: next@16.3.4 proxy.md).
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Cross-origin requests are not allowed' } },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
}
