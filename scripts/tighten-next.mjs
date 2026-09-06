// @ts-check
// The single definition of the .next permission policy: Turbopack's cache
// persists env secrets (ENCRYPTION_KEY, PLAID_SECRET) into world-readable
// files under .next, undoing .env.local's 0600. Every entry point that
// touches .next runs this script — predev, prebuild, postbuild, and
// scripts/start.mjs — so the policy has one home instead of four hand-copied
// chmod lines, and every call site fails closed the same way: a tighten that
// does not succeed stops the run rather than proceeding with the
// secret-bearing cache possibly readable by other local accounts. The
// directory is created first so its 0700 mode survives even a failed build
// (postbuild only fires on success). Design: build-cache-secret-permissions.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const nextDir = fileURLToPath(new URL('../.next', import.meta.url));
try {
  mkdirSync(nextDir, { recursive: true });
} catch (err) {
  console.error('tighten-next.mjs: could not create .next:', err);
  process.exit(1);
}
const tightened = spawnSync('chmod', ['-R', 'go-rwx', nextDir], { stdio: 'inherit' });
if (tightened.status !== 0) {
  console.error(
    'tighten-next.mjs: could not tighten permissions on .next — stopping rather than proceeding ' +
      'with the secret-bearing build cache possibly readable by other local accounts.',
  );
  process.exit(1);
}
