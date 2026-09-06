// The runtime bind assertion: the loopback bind (-H 127.0.0.1 in the npm
// scripts) is the enforcement layer of non-local-request-guard — the header
// checks in src/proxy.ts are forgeable on a direct connection — and a bare
// `next dev`/`next start` binds every interface and silently discards that
// layer (the Next CLI reads the hostname only from -H, with no env or config
// fallback). This module verifies the bind and kills the server when it is
// not loopback-only. Node builtins are imported statically, so it must only
// be loaded from register()'s nodejs-runtime branch (via dynamic import),
// like src/lib/sync-scheduler.ts. Design: non-local-request-guard.
import { connect } from 'net';
import { networkInterfaces, type NetworkInterfaceInfo } from 'os';
import { logError } from '@/lib/log';

const PROBE_DELAYS_MS = [3000, 15000];
const PROBE_TIMEOUT_MS = 1500;

// @types/node does not model the diagnostic-report body, so the shape is
// declared here (verified against Node 20 output; re-verified against Node
// 24.14.1 on 2026-09-06 — package.json's engines field and .nvmrc pin the
// Node major so an unnoticed runtime jump cannot outrun this check; re-verify
// and re-date on every major bump). A listening tcp handle's
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
// probing from outside: it sees the real port (`next dev`
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

function accepts(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

function fail(where: string): never {
  console.error(
    `FATAL: this server is reachable at ${where} — it is not bound to loopback. ` +
      'Start it with `npm run dev` or `npm run start` (which pass -H 127.0.0.1), ' +
      'never bare `next dev`/`next start`.',
  );
  return process.exit(1);
}

async function assertLoopbackOnly(logVerdict: boolean): Promise<void> {
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
  const addresses = Object.values(networkInterfaces())
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
  // "Passed" is only claimed when the primary sensor saw the bind. With no
  // listening socket visible at the final probe (a Node upgrade changed the
  // report shape, or the socket lives in another process), the probes above
  // aimed at PORT/3000 — which may not be the real port, since Next walks
  // the port forward on EADDRINUSE — so "could not verify" is fatal: serving
  // with the primary sensor blind is serving unasserted. Verified on Node 20,
  // and re-verified on Node 24.14.1 (2026-09-06, the pinned major — see
  // engines/.nvmrc), that both `next dev` and `next start` listen in the
  // process register() runs in, so a healthy server always reaches the
  // passed branch.
  if (logVerdict) {
    if (endpoints.length > 0) {
      console.log(
        `bind assertion passed (listening: ${endpoints
          .map((endpoint) => `${endpoint.address}:${endpoint.port}`)
          .join(', ')})`,
      );
    } else {
      console.error(
        'FATAL: the bind assertion could not verify the bind — no listening TCP socket is ' +
          `visible in this process's diagnostic report. External probes of port(s) ` +
          `${ports.join(', ')} found nothing reachable, but that port may not be the one ` +
          'actually served, so this is not a pass. Likely a Node upgrade changed the ' +
          'diagnostic-report shape (update listeningTcpEndpoints in ' +
          'src/lib/bind-assertion.ts), or the server was not started with `npm run dev` / ' +
          '`npm run start`. Refusing to serve unverified.',
      );
      process.exit(1);
    }
  }
}

// Probed twice because register() can run before the server is listening: a
// wide-open bind not yet accepting at the first probe is caught by the
// second, which also logs the verdict. unref() keeps the timers from
// holding the process open.
//
// Every failure of this guard is fail-closed (confirmed by the user
// 2026-09-06): a rejection (say, process.report throwing) exits here, and a
// diagnostic report whose shape drifted (a Node upgrade renaming the libuv
// handle fields) does not throw but leaves listeningTcpEndpoints() empty,
// which the final probe treats as fatal in assertLoopbackOnly — serving
// with the assertion blind is exactly what must not happen.
export function scheduleBindAssertion(): void {
  PROBE_DELAYS_MS.forEach((delay, index) => {
    setTimeout(() => {
      assertLoopbackOnly(index === PROBE_DELAYS_MS.length - 1).catch((err: unknown) => {
        logError('FATAL: the bind assertion could not run — refusing to serve without it:', err);
        process.exit(1);
      });
    }, delay).unref();
  });
}
