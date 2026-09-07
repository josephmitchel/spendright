// @ts-check
// Lint check: every `Verified-on: <package>@<version>` marker must match the installed major.minor.
// Design: verified-claims-checked.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root, sourceFiles } from './lib/source-files.mjs';

/** @param {string} pkg */
function installedVersion(pkg) {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8'))
      .version;
  } catch {
    return undefined;
  }
}

const MARKER = /Verified-on:\s*([a-z0-9._-]+)@(\d+(?:\.\d+)*)/g;

/** @param {string} version */
const majorMinor = (version) => version.split('.').slice(0, 2).join('.');

/** @type {string[]} */
const failures = [];
let markers = 0;
for (const file of sourceFiles()) {
  const label = relative(root, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(MARKER)) {
      markers++;
      const [, runtime, claimed] = match;
      if (!runtime || !claimed) continue;
      const at = `${label}:${index + 1}`;
      const installed = installedVersion(runtime);
      if (!installed) {
        failures.push(
          `${at} — Verified-on: ${runtime}@${claimed}, but ${runtime} is not installed`,
        );
      } else if (majorMinor(claimed) !== majorMinor(installed)) {
        failures.push(
          `${at} — verified on ${runtime}@${claimed} but ${installed} is installed — ` +
            're-verify the claim above the marker and update it',
        );
      }
    }
  });
}

if (failures.length > 0) {
  console.error('Verified-on claims out of date:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`verified claims ok (${markers} markers)`);
