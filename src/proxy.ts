import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/errors';

// SpendRight is a single-user tool with no authentication on any route, so
// nothing but the local browser may reach the app: every path refuses any
// request that did not arrive from loopback, with no exceptions. (The Plaid
// webhook + tunnel that used to be exempt here was retired for a
// scheduler — the app no longer has an internet-reachable origin at all.)
// Design: non-local-request-guard, single-user-localhost-no-auth,
// scheduled-sync.

// IPv6 loopback appears only bracketed: URL.hostname keeps the brackets, and
// an unbracketed ::1 in a Host header does not parse at all.
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function headerHostname(hostHeader: string): string | null {
  // A Host header holds a hostname and optionally a port — never userinfo, a
  // path, or a query. new URL() would parse "evil.com@localhost" or
  // "localhost/evil" into a loopback hostname, so anything that could smuggle
  // such structure is refused before parsing.
  if (/[/\\@?#\s]/.test(hostHeader)) return null;
  try {
    // URL handles [::1]:3000 and bare hosts alike.
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

// Same-origin means scheme, host, and port all match the request's own Host.
// A merely-local hostname is not enough: any other locally-running site
// (another dev server on some other port) is a different origin and must not
// be able to drive this API.
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

// Next fills x-forwarded-host/-for itself (from Host and the socket's remote
// address) but with ??=, so a forwarding proxy's values survive: locally
// they name loopback; through any proxy or tunnel someone puts in front of
// the app they name the forwarded host and the caller's real IP. Presence
// means nothing; the values are the signal. x-forwarded-for can be a comma
// chain, and only a chain that is loopback end-to-end is local — a forged
// loopback entry still arrives alongside the proxy's appended real address.
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
  // A uniform bodyless 404 for anything non-local tells a scanner nothing.
  // The host check also defeats DNS rebinding for every routed path — but
  // not for `next dev`'s /__nextjs_* endpoints, which Next serves before the
  // proxy runs (see non-local-request-guard: prefer production mode for
  // everyday use).
  if (!isLocalRequest(req)) return new NextResponse(null, { status: 404 });

  // CSRF: a hostile page can fire preflight-free cross-origin POSTs at
  // localhost. Browsers attach Origin to every cross-origin request, so a
  // state-changing request bearing an Origin must be same-origin with the
  // request itself. Origin-less requests (curl, same-origin navigation) pass.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (origin && (!host || !isSameOrigin(origin, host))) {
      return jsonError('FORBIDDEN', 'Cross-origin requests are not allowed', 403);
    }
  }

  return NextResponse.next();
}
