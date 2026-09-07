// @ts-check
// The one definition of which files the lint-time checkers walk, shared so
// adding a source directory or extension cannot silently drop coverage from
// one checker while the other keeps it.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: the pathname is percent-encoded, so a
// repo path with a space or non-ASCII character would make every fs call
// miss (and the checkers silently walk nothing).
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

// Every checked source file, as absolute paths. The repo root is walked
// shallowly too: the config files there carry Design: markers of their own.
/** @returns {Generator<string>} */
export function* sourceFiles() {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (!statSync(path).isDirectory() && /\.(ts|tsx|mjs)$/.test(entry)) yield path;
  }
  for (const dir of sourceDirs) yield* walk(join(root, dir));
}
