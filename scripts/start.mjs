// @ts-check
// `next start` runs instrumentation.ts (the sync scheduler) lazily, on the
// first incoming request (outside dev, NextServer.prepare() skips server
// preparation and register() waits for handleRequest).
// Verified-on: next@16.3.4
// This wrapper starts the server and immediately sends that first request
// itself; if the warm-up cannot be delivered, it stops the server.
// Design: non-local-request-guard, scheduled-sync.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

// Tightened here as well as around every build and dev session, all through
// the one policy script (it prints its own error and exits non-zero on
// failure); refusing to start beats serving with the secret-bearing cache
// possibly readable by other local accounts.
// Design: build-cache-secret-permissions.
const tighten = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('./tighten-next.mjs', import.meta.url))],
  { stdio: 'inherit' },
);
if (tighten.status !== 0) process.exit(1);

// The resolved port is re-passed to Next as a trailing `-p` below
// (last-wins), so the warm-up target and the served port cannot diverge even
// if this parse disagrees with the Next CLI's own (`-p 3001`, `-p3001`,
// `--port 3001`, `--port=3001`, last one wins, PORT as fallback).
const args = process.argv.slice(2);
let port = Number(process.env.PORT) || 3000;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === undefined) continue;
  if (arg === '-p' || arg === '--port') port = Number(args[i + 1] ?? NaN);
  else if (arg.startsWith('--port=')) port = Number(arg.slice('--port='.length));
  else if (arg.startsWith('-p') && !arg.startsWith('--')) port = Number(arg.slice('-p'.length));
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(
    `start.mjs: could not resolve a usable port from the arguments (got ${port}) — refusing ` +
      'to start rather than warm up the wrong port. Pass -p/--port with a port from 1-65535.',
  );
  process.exit(1);
}

// The loopback bind and the resolved port come after the user's args: the
// Next CLI's last-wins semantics make them unconditional, so a stray
// `-H 0.0.0.0` cannot override the bind. Verified-on: next@16.3.4
const child = spawn(
  process.execPath,
  [nextBin, 'start', ...args, '-H', '127.0.0.1', '-p', String(port)],
  {
    stdio: 'inherit',
  },
);
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => child.kill(signal));
}

// Poll until the server answers; the warm-up request itself is what triggers
// instrumentation, so any response status counts as done.
const deadline = Date.now() + 60_000;
let warmedUp = false;
while (Date.now() < deadline && child.exitCode === null) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, {
      redirect: 'manual',
      // A hung response (connection accepted, nothing sent back) must land in
      // the catch and re-enter the retry loop, not stall this await past the
      // deadline and dodge the fail-closed exit below.
      signal: AbortSignal.timeout(5000),
    });
    warmedUp = true;
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
if (!warmedUp && child.exitCode === null) {
  console.error(
    `start.mjs: no response from http://127.0.0.1:${port}/ within 60s — the warm-up that starts ` +
      'the sync scheduler never ran. Stopping the server rather than leaving it up without it.',
  );
  child.kill('SIGTERM');
  process.exitCode = 1;
}
