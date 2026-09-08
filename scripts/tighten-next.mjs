// @ts-check
import { chmodSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nextDir = fileURLToPath(new URL('../.next', import.meta.url));

// POSIX group/other bits don't exist on Windows; NTFS ACLs default to
// per-user profile isolation there, so skipping is not fail-open.
if (process.platform === 'win32') {
  console.log('tighten-next.mjs: skipping POSIX permission tightening on Windows');
  process.exit(0);
}

/** @param {string} path */
function tighten(path) {
  const stats = statSync(path);
  chmodSync(path, stats.mode & 0o700);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) tighten(join(path, entry));
  }
}

try {
  mkdirSync(nextDir, { recursive: true });
  tighten(nextDir);
} catch (err) {
  console.error(
    'tighten-next.mjs: could not tighten permissions on .next — stopping rather than proceeding ' +
      'with the secret-bearing build cache possibly readable by other local accounts.',
    err,
  );
  process.exit(1);
}
