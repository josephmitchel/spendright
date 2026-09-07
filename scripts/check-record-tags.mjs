// @ts-check
// The reverse of check-design-refs.mjs: verifies every code-shaped tag in a
// .claude/design/current record still names something in the tree, so a
// record describing deleted machinery fails the run instead of silently
// misleading the next reader. A tag containing whitespace is a concept, not
// a code claim, and is never checked — rewording a tag with a space is the
// opt-out for names that live outside the repo. Runs as part of `npm run lint`.
// Design: record-tags-checked.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { root, sourceFiles } from './lib/source-files.mjs';

const currentDir = join(root, '.claude/design/current');

// Beyond the shared source walk, records legitimately cite npm scripts and
// dependencies (package.json), compiler options (tsconfig.json), and columns
// that only migration history still names (drizzle/*.sql).
function* checkedFiles() {
  yield* sourceFiles();
  for (const extra of ['package.json', 'tsconfig.json']) yield join(root, extra);
  const migrationsDir = join(root, 'drizzle');
  try {
    for (const entry of readdirSync(migrationsDir)) {
      if (entry.endsWith('.sql')) yield join(migrationsDir, entry);
    }
  } catch {
    // No migrations directory is not this checker's failure to report.
  }
}

let corpus = '';
const basenames = new Set();
for (const file of checkedFiles()) {
  corpus += readFileSync(file, 'utf8') + '\n';
  basenames.add(basename(file));
}

// The frontmatter tags array, tolerant of both the single-line and the
// bracketed multi-line form the records actually use. Not YAML: tags contain
// unquoted brackets (route paths, dynamic segments) no YAML parser accepts.
/** @param {string} text @returns {string[]} */
function tagsOf(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return [];
  const end = lines.indexOf('---', 1);
  const frontmatter = lines.slice(1, end === -1 ? lines.length : end);
  const start = frontmatter.findIndex((line) => /^tags:/.test(line));
  if (start === -1) return [];
  let value = (frontmatter[start] ?? '').replace(/^tags:\s*/, '');
  let i = start;
  while (!value.trimEnd().endsWith(']') && ++i < frontmatter.length) {
    value += ' ' + (frontmatter[i] ?? '').trim();
  }
  return value
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

// A DB table.column tag (items.access_token): the snake_case halves appear
// separately in schema.ts and migrations, never as the dotted pair.
const TABLE_COLUMN = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** @param {string} tag */
function resolves(tag) {
  if (corpus.includes(tag)) return true;
  if (existsSync(join(root, tag))) return true;
  if (basenames.has(tag)) return true;
  if (TABLE_COLUMN.test(tag)) {
    const [table = '', column = ''] = tag.split('.');
    return corpus.includes(table) && corpus.includes(column);
  }
  return false;
}

/** @type {string[]} */
const failures = [];
let checked = 0;
for (const file of readdirSync(currentDir).filter((entry) => entry.endsWith('.md'))) {
  for (const tag of tagsOf(readFileSync(join(currentDir, file), 'utf8'))) {
    if (/\s/.test(tag)) continue;
    checked++;
    if (!resolves(tag)) failures.push(`${file} — tag "${tag}" names nothing in the tree`);
  }
}

if (failures.length > 0) {
  console.error('Record tags out of sync with the code (reconcile the record,');
  console.error('or reword a tag with a space if it names a concept or something external):');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`record tags ok (${checked} tags)`);
