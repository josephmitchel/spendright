import { type NextRequest, NextResponse } from 'next/server';

// Design: non-local-request-guard, single-user-localhost-no-auth.

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function headerHostname(hostHeader: string): string | null {
  // new URL() would parse "evil.com@localhost" or "localhost/evil" into a
  // loopback hostname, so illegal Host structure is refused before parsing.
  if (/[/\\@?#\s]/.test(hostHeader)) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

function isSameOrigin(origin: string, hostHeader: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.host === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

function isLoopbackIp(entry: string): boolean {
  const ip = entry.trim().replace(/^::ffff:/i, '');
  return ip === '::1' || ip === '[::1]' || /^127(\.\d{1,3}){3}$/.test(ip);
}

// Next fills x-forwarded-host/-for with ??= (Verified-on: next@16.3.4), so a
// forwarding proxy's values survive and must be checked.
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

  return NextResponse.next();
}
