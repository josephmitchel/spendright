// @ts-check
// Design: build-cache-secret-permissions.
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
