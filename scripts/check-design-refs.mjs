// Verifies every `Design: <name>` reference in source comments points at a
// live record in .claude/design/current/. A reference to a retired or
// missing record fails the run, so renaming or retiring a record cannot
// silently strand the markers that cite it. Runs as part of `npm run lint`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const currentDir = join(root, '.claude/design/current');
const retiredDir = join(root, '.claude/design/retired');
const sourceDirs = ['src', 'scripts'];

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

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) yield path;
  }
}

// A record name: kebab-case with at least one hyphen, so prose words after
// "Design:" can never register as a reference.
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

// Collects the names cited by one Design: marker, following the comment onto
// continuation lines while each line ends with a comma.
function referencesIn(lines, fileLabel) {
  const refs = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /Design:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    let tail = match[1];
    while (tail.trimEnd().endsWith(',') && i + 1 < lines.length) {
      i++;
      tail += ' ' + lines[i].replace(/^\s*(\/\/|\/?\*+)\s*/, '');
    }
    for (const token of tail.split(/[\s,]+/)) {
      const name = token.replace(/[."'`;:)}*/\\]+$/g, '');
      if (NAME.test(name)) refs.push({ name, line: i + 1, file: fileLabel });
    }
  }
  return refs;
}

const failures = [];
for (const dir of sourceDirs) {
  for (const file of sourceFiles(join(root, dir))) {
    const label = relative(root, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const ref of referencesIn(lines, label)) {
      if (current.has(ref.name)) continue;
      const state = retired.has(ref.name) ? 'a RETIRED record' : 'no record';
      failures.push(`${ref.file}:${ref.line} — Design: ${ref.name} matches ${state}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Design references out of sync with .claude/design/current:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`design refs ok (${current.size} records)`);
