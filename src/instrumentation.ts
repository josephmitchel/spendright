import type { NetworkInterfaceInfo } from 'os';

// Two once-per-server jobs. First, the bind assertion: the loopback bind
// (-H 127.0.0.1 in the npm scripts) is the enforcement layer of
// non-local-request-guard; the header checks in src/proxy.ts are forgeable
// on a direct connection. A bare `next dev`/`next start` binds every
// interface and silently discards that layer (the Next CLI reads the
// hostname only from -H — no env or config fallback). Second, the sync
// scheduler (design: scheduled-sync). The assertion timers are scheduled
// before the scheduler's fallible import, so no failure in the sync module
// graph can disable the assertion (2026-09-05 audit).
// Design: non-local-request-guard.

const PROBE_DELAYS_MS = [3000, 15000];
const PROBE_TIMEOUT_MS = 1500;

// @types/node does not model the diagnostic-report body, so the shape is
// declared here (verified against Node 20 output). A listening tcp handle's
// signature: a localEndpoint, no remoteEndpoint, active, and neither
// readable nor writable — a client socket mid-connect also has no
// remoteEndpoint yet, but reports readable/writable true.
interface TcpHandle {
  type?: string;
  is_active?: boolean;
  readable?: boolean;
  writable?: boolean;
  localEndpoint?: { ip4?: string; ip6?: string; port?: number } | null;
  remoteEndpoint?: unknown;
}

// This process's own listening TCP sockets. Reading the bind address beats
// probing from outside (2026-09-05 audit): it sees the real port (`next dev`
// walks the port forward on EADDRINUSE without setting PORT, and -p is not
// visible here), it sees a wildcard bind even when no non-loopback interface
// exists yet (Wi-Fi off, VPN not up), and it can never blame another
// process's server for the port.
function listeningTcpEndpoints(): Array<{ address: string; port: number }> {
  const report = process.report?.getReport() as unknown as { libuv?: TcpHandle[] } | undefined;
  const endpoints: Array<{ address: string; port: number }> = [];
  for (const handle of report?.libuv ?? []) {
    if (
      handle.type !== 'tcp' ||
      handle.is_active !== true ||
      handle.readable !== false ||
      handle.writable !== false ||
      handle.remoteEndpoint ||
      !handle.localEndpoint
    ) {
      continue;
    }
    const { ip4, ip6, port } = handle.localEndpoint;
    const address = ip4 ?? ip6;
    if (address && typeof port === 'number') endpoints.push({ address, port });
  }
  return endpoints;
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [os, net] = await Promise.all([import('os'), import('net')]);

  const accepts = (host: string, port: number): Promise<boolean> =>
    new Promise((resolve) => {
      const socket = net.connect({ host, port });
      const done = (reachable: boolean) => {
        socket.destroy();
        resolve(reachable);
      };
      socket.setTimeout(PROBE_TIMEOUT_MS);
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.once('timeout', () => done(false));
    });

  const fail = (where: string): never => {
    console.error(
      `FATAL: this server is reachable at ${where} — it is not bound to loopback. ` +
        'Start it with `npm run dev` or `npm run start` (which pass -H 127.0.0.1), ' +
        'never bare `next dev`/`next start`.',
    );
    return process.exit(1);
  };

  const assertLoopbackOnly = async (logVerdict: boolean): Promise<void> => {
    // Primary check: this process's own bind addresses. Only a wildcard bind
    // fails directly — that can only be a listening server socket. A specific
    // non-loopback bind is confirmed by the connect probe below instead, so a
    // client socket misread as listening can never kill the server over its
    // ephemeral port.
    const endpoints = listeningTcpEndpoints();
    for (const endpoint of endpoints) {
      if (endpoint.address === '0.0.0.0' || endpoint.address === '::') {
        fail(`${endpoint.address}:${endpoint.port} (this process is listening on every interface)`);
      }
    }
    // Second layer, and the only layer if the listening socket lives in
    // another process and the report shows none: probe every non-loopback
    // interface address on each port known to be in use.
    const ports =
      endpoints.length > 0
        ? [...new Set(endpoints.map((endpoint) => endpoint.port))]
        : [Number(process.env.PORT) || 3000];
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((iface): iface is NetworkInterfaceInfo => iface !== undefined && !iface.internal)
      .map((iface) => iface.address);
    // In parallel: link-local addresses run out the full connect timeout, and
    // one at a time they would push the verdict far past the probe delay.
    const reachable = (
      await Promise.all(
        addresses.flatMap((address) =>
          ports.map(async (port) => ((await accepts(address, port)) ? `${address}:${port}` : null)),
        ),
      )
    ).find((endpoint) => endpoint !== null);
    if (reachable) fail(reachable);
    if (logVerdict) {
      console.log(
        endpoints.length > 0
          ? `bind assertion passed (listening: ${endpoints
              .map((endpoint) => `${endpoint.address}:${endpoint.port}`)
              .join(', ')})`
          : 'bind assertion passed: no listening socket visible in this process; external probes found nothing',
      );
    }
  };

  // Probed twice because register() can run before the server is listening: a
  // wide-open bind not yet accepting at the first probe is caught by the
  // second, which also logs the verdict. unref() keeps the timers from
  // holding the process open.
  PROBE_DELAYS_MS.forEach((delay, index) => {
    setTimeout(() => void assertLoopbackOnly(index === PROBE_DELAYS_MS.length - 1), delay).unref();
  });

  // Dynamically imported so the module graph (db, Plaid SDK) loads only in
  // the nodejs runtime. A broken config (say, an unset DATABASE_URL) throws
  // here, and Next does not treat a rejected register() as fatal (verified
  // 2026-09-05: it logs and keeps serving), so the exit is explicit — better
  // than a live server whose every sync would fail.
  // Design: config-validated-not-assumed.
  try {
    const { startSyncScheduler } = await import('@/lib/sync-scheduler');
    startSyncScheduler();
  } catch (err) {
    console.error('FATAL: startup config is broken —', err);
    process.exit(1);
  }
}
