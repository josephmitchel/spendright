// @ts-check
// Verifies every `Design: <name>` reference in source comments points at a
// live record in .claude/design/current/. A reference to a retired or
// missing record fails the run, so renaming or retiring a record cannot
// silently strand the markers that cite it. Runs as part of `npm run lint`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root, sourceFiles } from './lib/source-files.mjs';

const currentDir = join(root, '.claude/design/current');
const retiredDir = join(root, '.claude/design/retired');

/** @param {string} dir */
function recordNames(dir) {
  try {
    return new Set(
      readdirSync(dir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => file.replace(/\.md$/, '')),
    );
  } catch {
    return new Set();
  }
}

const current = recordNames(currentDir);
const retired = recordNames(retiredDir);

// A record name: kebab-case with at least one hyphen, so prose words after
// "Design:" can never register as a reference.
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

// Collects the names cited by one Design: marker, following the comment onto
// continuation lines while each line ends with a comma; the continuation
// loop advances the outer cursor so those lines are not re-scanned.
/** @param {string[]} lines @param {string} fileLabel */
function referencesIn(lines, fileLabel) {
  /** @type {{ name: string, line: number, file: string }[]} */
  const refs = [];
  let i = 0;
  while (i < lines.length) {
    // Case-insensitive so a lowercase "(design: name)" marker is validated
    // rather than silently ungated.
    const match = /design:\s*(.*)$/i.exec(lines[i] ?? '');
    // Reported at the marker's own line, not the last continuation line.
    const markerLine = i + 1;
    i++;
    if (!match) continue;
    let tail = match[1] ?? '';
    while (tail.trimEnd().endsWith(',') && i < lines.length) {
      tail += ' ' + (lines[i] ?? '').replace(/^\s*(\/\/|\/?\*+)\s*/, '');
      i++;
    }
    for (const token of tail.split(/[\s,]+/)) {
      const name = token.replace(/[."'`;:)}*/\\]+$/g, '');
      if (NAME.test(name)) refs.push({ name, line: markerLine, file: fileLabel });
    }
  }
  return refs;
}

/** @type {string[]} */
const failures = [];
for (const file of sourceFiles()) {
  const label = relative(root, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const ref of referencesIn(lines, label)) {
    if (current.has(ref.name)) continue;
    const state = retired.has(ref.name) ? 'a RETIRED record' : 'no record';
    failures.push(`${ref.file}:${ref.line} — Design: ${ref.name} matches ${state}`);
  }
}

if (failures.length > 0) {
  console.error('Design references out of sync with .claude/design/current:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`design refs ok (${current.size} records)`);
