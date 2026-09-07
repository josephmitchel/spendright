// @ts-check
// Lint check: every code-shaped tag in a .claude/design/current record must still name something in the tree.
// Design: record-tags-checked.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { root, sourceFiles } from './lib/source-files.mjs';

const currentDir = join(root, '.claude/design/current');

// drizzle/*.sql is deliberately absent: append-only migrations contain every identifier ever deleted.
function* checkedFiles() {
  yield* sourceFiles();
  for (const extra of ['package.json', 'tsconfig.json']) yield join(root, extra);
}

// Prose comment lines leave the corpus so a deleted identifier living on in prose can't satisfy a tag.
/** @param {string} file @param {string} text */
function checkableText(file, text) {
  if (!/\.(ts|tsx|mjs)$/.test(file)) return text;
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      if (/^\/\/\s*(Design|Verified-on):/.test(trimmed)) return true;
      return !/^(\/\/|\/?\*)/.test(trimmed);
    })
    .join('\n');
}

let corpus = '';
const basenames = new Set();
const fileStems = new Set();
for (const file of checkedFiles()) {
  corpus += checkableText(file, readFileSync(file, 'utf8')) + '\n';
  const name = basename(file);
  basenames.add(name);
  fileStems.add(name.replace(/\.[a-z]+$/, ''));
}

const npmScripts = new Set(
  Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}),
);

// Textual parse of live tables/columns from src/db/schema.ts; any anomaly throws rather than
// degrading table.column tags to the weaker corpus check.
function schemaTables() {
  const schema = readFileSync(join(root, 'src/db/schema.ts'), 'utf8');
  const importedBuilders = /import\s*\{([^}]*)\}\s*from 'drizzle-orm\/pg-core'/.exec(schema)?.[1];
  if (!importedBuilders) throw new Error('schema.ts: no drizzle-orm/pg-core import found');
  const builders = importedBuilders
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name && !['pgTable', 'index', 'unique', 'check'].includes(name));
  if (builders.length === 0) throw new Error('schema.ts: no column builders imported');
  const columnCall = new RegExp(`\\b(?:${builders.join('|')})\\('([a-z0-9_]+)'`, 'g');

  /** @type {Map<string, Set<string>>} */
  const tables = new Map();
  const blocks = schema.split(/\bpgTable\(\s*'([a-z0-9_]+)',/);
  // blocks alternate: [preamble, name, body, name, body, ...]
  for (let i = 1; i < blocks.length; i += 2) {
    const columns = new Set();
    for (const match of (blocks[i + 1] ?? '').matchAll(columnCall)) columns.add(match[1]);
    const table = blocks[i] ?? '';
    if (columns.size === 0) throw new Error(`schema.ts: no columns parsed for table "${table}"`);
    tables.set(table, columns);
  }
  const pgTableCalls = schema.match(/\bpgTable\(/g)?.length ?? 0;
  if (tables.size === 0 || tables.size !== pgTableCalls) {
    throw new Error(
      `schema.ts: parsed ${tables.size} tables but found ${pgTableCalls} pgTable calls`,
    );
  }
  return tables;
}
const tables = schemaTables();

const TABLE_COLUMN = /^([a-z0-9_]+)\.([a-z0-9_]+)$/;

// Custom boundary class so `$type` and `x-forwarded-for` work as tags.
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
    // A non-table pair (db.select, console.error) is an ordinary identifier claim.
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

// Not YAML on purpose: tags contain unquoted brackets no YAML parser accepts.
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
