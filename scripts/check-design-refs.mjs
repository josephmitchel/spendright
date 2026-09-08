// @ts-check
// Lint check, both directions: every `Design: <name>` reference must name a live record in
// .claude/design/current/, and every current record must be cited by at least one Design:
// marker in the walked files unless its frontmatter opts out with `code-refs: none`
// (for policy/meta records with no single code site). Design: design-consistency-checks.
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

// Requires a hyphen so prose words after "Design:" never register as a reference.
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/** @param {string[]} lines @param {string} fileLabel */
function referencesIn(lines, fileLabel) {
  /** @type {{ name: string, line: number, file: string }[]} */
  const refs = [];
  let i = 0;
  while (i < lines.length) {
    const match = /design:\s*(.*)$/i.exec(lines[i] ?? '');
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
const cited = new Set();
for (const file of sourceFiles()) {
  const label = relative(root, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const ref of referencesIn(lines, label)) {
    if (current.has(ref.name)) {
      cited.add(ref.name);
      continue;
    }
    const state = retired.has(ref.name) ? 'a RETIRED record' : 'no record';
    failures.push(`${ref.file}:${ref.line} — Design: ${ref.name} matches ${state}`);
  }
}

// Reverse direction: an uncited record either opts out explicitly or fails.
for (const name of current) {
  if (cited.has(name)) continue;
  const text = readFileSync(join(currentDir, `${name}.md`), 'utf8');
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  if (/^code-refs:\s*none\s*$/m.test(frontmatter)) continue;
  failures.push(
    `.claude/design/current/${name}.md — cited by no Design: marker in the tree ` +
      `(add the marker to the code it describes, or opt out with \`code-refs: none\` in its frontmatter)`,
  );
}

// [[name]] cross-links inside the records themselves must resolve too
// (a retired target is fine — records may cite walked-back decisions).
for (const dir of [currentDir, retiredDir]) {
  /** @type {string[]} */
  let mdFiles = [];
  try {
    mdFiles = readdirSync(dir).filter((entry) => entry.endsWith('.md'));
  } catch {
    continue;
  }
  for (const file of mdFiles) {
    const text = readFileSync(join(dir, file), 'utf8');
    for (const match of text.matchAll(/\[\[([a-z0-9-]+)\]\]/g)) {
      const name = match[1] ?? '';
      if (!current.has(name) && !retired.has(name)) {
        failures.push(`${relative(root, join(dir, file))} — link [[${name}]] matches no record`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Design references out of sync with .claude/design/current:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`design refs ok (${current.size} records)`);
