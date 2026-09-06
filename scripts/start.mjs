// `next start` runs instrumentation.ts — the loopback bind assertion and the
// sync scheduler — lazily, on the first incoming request (2026-09-05 audit:
// outside dev, NextServer.prepare() is a no-op and register() waits for
// handleRequest). This wrapper starts the server and immediately sends that
// first request itself, so both jobs run at startup as the design records
// require. If the warm-up cannot be delivered, the wrapper stops the server:
// serving with the assertion and the scheduler dormant is exactly the state
// the records say must not go unnoticed (2026-09-06 audit).
// Design: non-local-request-guard, scheduled-sync.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

// The Turbopack cache under .next persists process.env values (ENCRYPTION_KEY
// and PLAID_SECRET among them) into files created world-readable, undoing
// .env.local's 0600. Tightened here as well as after every build (postbuild),
// so cache left by earlier dev sessions is covered too.
// Design: build-cache-secret-permissions.
const nextDir = fileURLToPath(new URL('../.next', import.meta.url));
if (existsSync(nextDir)) {
  const tightened = spawnSync('chmod', ['-R', 'go-rwx', nextDir]);
  if (tightened.status !== 0) {
    console.error(
      'start.mjs: could not tighten permissions on .next — refusing to start with the ' +
        'secret-bearing build cache possibly readable by other local accounts.',
    );
    process.exit(1);
  }
}

// The Next CLI (commander) accepts `-p 3001`, `-p3001`, `--port 3001` and
// `--port=3001`, last one wins, PORT as fallback. Every accepted form must be
// parsed here or the warm-up aims at the wrong port — worst case another local
// server answers there and this one keeps serving with instrumentation dormant
// (2026-09-06 audit). A form Next rejects (e.g. `-p=3001`) parses to NaN here,
// but Next itself then exits, which stops the wrapper too.
const args = process.argv.slice(2);
let port = Number(process.env.PORT) || 3000;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-p' || arg === '--port') port = Number(args[i + 1]);
  else if (arg.startsWith('--port=')) port = Number(arg.slice('--port='.length));
  else if (arg.startsWith('-p') && !arg.startsWith('--')) port = Number(arg.slice('-p'.length));
}

// The loopback bind comes after the user's args: commander's last-wins
// semantics make it unconditional, so a stray `-H 0.0.0.0` cannot override it
// (2026-09-06 audit; the instrumentation bind assertion remains the backstop).
const child = spawn(process.execPath, [nextBin, 'start', ...args, '-H', '127.0.0.1'], {
  stdio: 'inherit',
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
for (const signal of ['SIGINT', 'SIGTERM']) {
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
      'the bind assertion and the sync scheduler never ran. Stopping the server rather than ' +
      'leaving it up without them.',
  );
  child.kill('SIGTERM');
  process.exitCode = 1;
}
