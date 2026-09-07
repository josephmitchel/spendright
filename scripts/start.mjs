// @ts-check
// `next start` runs instrumentation.ts lazily, on the first incoming request (Verified-on: next@16.3.4);
// this wrapper sends that first request itself and stops the server if it cannot be delivered.
// Design: non-local-request-guard, scheduled-sync.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

// Design: build-cache-secret-permissions.
const tighten = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('./tighten-next.mjs', import.meta.url))],
  { stdio: 'inherit' },
);
if (tighten.status !== 0) process.exit(1);

// The resolved port is re-passed to Next as a trailing `-p` (last-wins), so the warm-up target
// and the served port cannot diverge even if this parse disagrees with the Next CLI's own.
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

// A server crash (e.g. the process backstop's fatal exit) must not silently end
// automatic syncing, so unexpected exits restart the child — with a crash-loop
// guard so a persistent fault still surfaces as a hard stop.
// Design: process-crash-backstop.
let shuttingDown = false;
/** @type {import('node:child_process').ChildProcess} */
let child;
/** @type {number[]} */
const recentStarts = [];

function spawnServer() {
  recentStarts.push(Date.now());
  // Bind and port trail the user's args so a stray `-H 0.0.0.0` cannot override them (Verified-on: next@16.3.4).
  child = spawn(
    process.execPath,
    [nextBin, 'start', ...args, '-H', '127.0.0.1', '-p', String(port)],
    {
      stdio: 'inherit',
    },
  );
  child.on('exit', (code, signal) => {
    if (shuttingDown) process.exit(signal ? 1 : (code ?? 1));
    while (recentStarts.length > 0 && (recentStarts[0] ?? 0) < Date.now() - 60_000) {
      recentStarts.shift();
    }
    if (recentStarts.length >= 3) {
      console.error(
        'start.mjs: the server exited 3 times within 60s — giving up rather than crash-looping. ' +
          'Fix the fault in the log above and start again.',
      );
      process.exit(1);
    }
    console.error(
      `start.mjs: the server exited unexpectedly (${signal ?? `code ${code}`}) — restarting in 1s.`,
    );
    setTimeout(() => {
      spawnServer();
      void warmUp();
    }, 1000);
  });
}

for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => {
    shuttingDown = true;
    child.kill(signal);
  });
}

// The warm-up request itself triggers instrumentation, so any response status counts as done.
async function warmUp() {
  const startedChild = child;
  const deadline = Date.now() + 60_000;
  let warmedUp = false;
  while (Date.now() < deadline && startedChild.exitCode === null) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, {
        redirect: 'manual',
        // A hung response must land in the catch and retry, not stall past the deadline.
        signal: AbortSignal.timeout(5000),
      });
      warmedUp = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!warmedUp && startedChild.exitCode === null) {
    console.error(
      `start.mjs: no response from http://127.0.0.1:${port}/ within 60s — the warm-up that starts ` +
        'the sync scheduler never ran. Stopping the server rather than leaving it up without it.',
    );
    shuttingDown = true;
    startedChild.kill('SIGTERM');
    process.exitCode = 1;
  }
}

spawnServer();
await warmUp();
