// @ts-check
// Shared definition of which files the lint-time checkers walk.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — the pathname is percent-encoded.
export const root = fileURLToPath(new URL('../..', import.meta.url));

const sourceDirs = ['src', 'scripts'];

/** @param {string} dir @returns {Generator<string>} */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) yield path;
  }
}

// The repo root is walked shallowly too: config files there carry Design: markers of their own.
/** @returns {Generator<string>} */
export function* sourceFiles() {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (!statSync(path).isDirectory() && /\.(ts|tsx|mjs)$/.test(entry)) yield path;
  }
  for (const dir of sourceDirs) yield* walk(join(root, dir));
}
