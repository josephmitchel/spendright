import type { NetworkInterfaceInfo } from 'os';

// The loopback bind (-H 127.0.0.1 in the npm scripts) is the enforcement
// layer of non-local-request-guard; the header checks in src/proxy.ts are
// forgeable on a direct connection. A bare `next dev`/`next start` binds
// every interface and silently discards that layer (the Next CLI reads the
// hostname only from -H — no env or config fallback), so shortly after
// startup the server probes its own port on each non-loopback interface
// address and exits if any of them accepts a connection.
// Design: non-local-request-guard.

const PROBE_DELAYS_MS = [3000, 15000];
const PROBE_TIMEOUT_MS = 1500;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [os, net] = await Promise.all([import('os'), import('net')]);
  // The port is not knowable here when set via -p, but this app runs on the
  // default; PORT is honored for parity with the Next CLI.
  const port = Number(process.env.PORT) || 3000;

  const accepts = (host: string): Promise<boolean> =>
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

  // Probed twice because register() runs before the server is listening: a
  // wide-open bind that is not yet accepting at the first probe is caught by
  // the second. unref() keeps the timers from holding the process open.
  for (const delay of PROBE_DELAYS_MS) {
    setTimeout(async () => {
      const addresses = Object.values(os.networkInterfaces())
        .flat()
        .filter((iface): iface is NetworkInterfaceInfo => iface !== undefined && !iface.internal)
        .map((iface) => iface.address);
      for (const address of addresses) {
        if (await accepts(address)) {
          console.error(
            `FATAL: this server is reachable at ${address}:${port} — it is not bound to loopback. ` +
              'Start it with `npm run dev` or `npm run start` (which pass -H 127.0.0.1), ' +
              'never bare `next dev`/`next start`.',
          );
          process.exit(1);
        }
      }
    }, delay).unref();
  }
}
