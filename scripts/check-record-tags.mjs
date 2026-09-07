// @ts-check
// The reverse of check-design-refs.mjs: verifies every code-shaped tag in a
// .claude/design/current record still names something in the tree, so a
// record describing deleted machinery fails the run instead of silently
// misleading the next reader. A tag containing whitespace is a concept, not
// a code claim, and is never checked — rewording a tag with a space is the
// opt-out for names that live outside the repo. Resolution is deliberately
// strict about the two ways a stale tag used to slip through: identifiers
// match on word boundaries against live sources only (never migration
// history, which names every column the schema ever had), and a table.column
// tag must name a live column of that live table in src/db/schema.ts. A bare
// lowercase word of five characters or fewer matches incidental text
// anywhere, so it resolves only as an exact table, npm script, or file name.
// Runs as part of `npm run lint`. Design: record-tags-checked.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { root, sourceFiles } from './lib/source-files.mjs';

const currentDir = join(root, '.claude/design/current');

// Beyond the shared source walk, records legitimately cite npm scripts and
// dependencies (package.json) and compiler options (tsconfig.json).
// drizzle/*.sql is deliberately absent: migrations are append-only, so their
// text contains every identifier ever deleted and can never fail a tag.
function* checkedFiles() {
  yield* sourceFiles();
  for (const extra of ['package.json', 'tsconfig.json']) yield join(root, extra);
}

let corpus = '';
const basenames = new Set();
const fileStems = new Set();
for (const file of checkedFiles()) {
  corpus += readFileSync(file, 'utf8') + '\n';
  const name = basename(file);
  basenames.add(name);
  fileStems.add(name.replace(/\.[a-z]+$/, ''));
}

const npmScripts = new Set(
  Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}),
);

// Live tables and their live column names, from src/db/schema.ts (never from
// migration history). Column names are the string arguments to the column
// builders schema.ts imports from drizzle-orm/pg-core; pgTable/index/unique/
// check are the non-column imports.
function schemaTables() {
  const schema = readFileSync(join(root, 'src/db/schema.ts'), 'utf8');
  const importMatch = /import\s*\{([^}]*)\}\s*from 'drizzle-orm\/pg-core'/.exec(schema);
  const builders = (importMatch?.[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name && !['pgTable', 'index', 'unique', 'check'].includes(name));
  const columnCall = new RegExp(`\\b(?:${builders.join('|')})\\('([a-z0-9_]+)'`, 'g');

  /** @type {Map<string, Set<string>>} */
  const tables = new Map();
  const blocks = schema.split(/\bpgTable\(\s*'([a-z0-9_]+)',/);
  // blocks alternate: [preamble, name, body, name, body, ...]
  for (let i = 1; i < blocks.length; i += 2) {
    const columns = new Set();
    for (const match of (blocks[i + 1] ?? '').matchAll(columnCall)) columns.add(match[1]);
    tables.set(blocks[i] ?? '', columns);
  }
  return tables;
}
const tables = schemaTables();

// A DB table.column tag (items.access_token): both halves must be live in
// the schema — matching each half anywhere in the tree is how tags for
// dropped columns used to pass forever.
const TABLE_COLUMN = /^([a-z0-9_]+)\.([a-z0-9_]+)$/;

// A word-boundary match (custom class, so `$type` and `x-forwarded-for` work
// as tags): the tag must not sit inside a longer identifier.
/** @param {string} tag */
function corpusHasWord(tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`).test(corpus);
}

/** @param {string} tag @returns {{ ok: boolean, hint?: string }} */
function resolve(tag) {
  if (existsSync(join(root, tag))) return { ok: true };
  if (basenames.has(tag)) return { ok: true };
  const tableColumn = TABLE_COLUMN.exec(tag);
  if (tableColumn) {
    const [, table = '', column = ''] = tableColumn;
    const columns = tables.get(table);
    // A live table with a dead column fails outright; a non-table pair
    // (db.select, console.error) is an ordinary identifier claim.
    if (columns) {
      return columns.has(column)
        ? { ok: true }
        : { ok: false, hint: `schema table "${table}" has no column "${column}"` };
    }
  }
  if (/^[a-z]{1,5}$/.test(tag)) {
    return tables.has(tag) || npmScripts.has(tag) || fileStems.has(tag)
      ? { ok: true }
      : {
          ok: false,
          hint: 'bare words this short are too generic to verify — use the precise identifier',
        };
  }
  return corpusHasWord(tag) ? { ok: true } : { ok: false };
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

/** @type {string[]} */
const failures = [];
let checked = 0;
for (const file of readdirSync(currentDir).filter((entry) => entry.endsWith('.md'))) {
  for (const tag of tagsOf(readFileSync(join(currentDir, file), 'utf8'))) {
    if (/\s/.test(tag)) continue;
    checked++;
    const outcome = resolve(tag);
    if (!outcome.ok) {
      const hint = outcome.hint ? ` (${outcome.hint})` : '';
      failures.push(`${file} — tag "${tag}" names nothing in the tree${hint}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Record tags out of sync with the code (reconcile the record,');
  console.error('or reword a tag with a space if it names a concept or something external):');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`record tags ok (${checked} tags)`);
