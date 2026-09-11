import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const STAMP_PATH = path.join(repoRoot, '.claude', 'audit-gate.json');
const GATED_LEVELS = new Set(['major', 'moderate']);

function fail(message) {
  console.error(`audit-gate: FAIL — ${message}`);
  process.exit(1);
}

function git(args) {
  return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function parseFrontmatter(fileContent) {
  const match = fileContent.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.+?)\s*(?:#.*)?$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  return fields;
}

const NON_CONCERN_FILES = new Set(['SUMMARY.md', 'FIXLOG.md', 'TESTS.md']);

function collectConcernFiles(auditDir) {
  const files = [];
  for (const entry of fs.readdirSync(auditDir, { withFileTypes: true })) {
    const full = path.join(auditDir, entry.name);
    if (entry.isDirectory()) {
      for (const sub of fs.readdirSync(full)) {
        if (sub.endsWith('.md')) files.push(path.join(full, sub));
      }
    } else if (entry.name.endsWith('.md') && !NON_CONCERN_FILES.has(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function parseFixlog(auditDir) {
  const fixlogPath = path.join(auditDir, 'FIXLOG.md');
  const addressed = new Map();
  if (!fs.existsSync(fixlogPath)) return { exists: false, addressed };
  for (const line of fs.readFileSync(fixlogPath, 'utf8').split('\n')) {
    const entry = line.match(/^-\s+(\S+)\s+\[.*?\]\s+—\s+(fixed|ignored)\b/);
    if (entry) addressed.set(entry[1], entry[2]);
  }
  return { exists: true, addressed };
}

const branch = git('branch --show-current');
if (!branch) fail('not on a branch (detached HEAD)');

const branchAuditDir = path.join(repoRoot, '.claude', 'audit', ...branch.split('/'));
if (!fs.existsSync(branchAuditDir)) {
  fail(`no audits found for branch '${branch}' — run /audit first`);
}

const runs = fs
  .readdirSync(branchAuditDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\d{2}-\d{2}-\d{4}-\d{6}$/.test(e.name))
  .map((e) => e.name)
  .sort((a, b) => {
    const key = (name) => {
      const [mm, dd, yyyy, hhmmss] = name.split('-');
      return `${yyyy}${mm}${dd}${hhmmss}`;
    };
    return key(a).localeCompare(key(b));
  });
if (runs.length === 0) {
  fail(`no audit runs found for branch '${branch}' — run /audit first`);
}

const latestRun = runs.at(-1);
const auditDir = path.join(branchAuditDir, latestRun);
const { exists: fixlogExists, addressed } = parseFixlog(auditDir);

const gated = [];
let resolvedCount = 0;
for (const file of collectConcernFiles(auditDir)) {
  const fields = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!fields) fail(`no frontmatter in ${path.relative(repoRoot, file)}`);
  if (!GATED_LEVELS.has(fields.level)) continue;
  if (fields.status === 'resolved') {
    resolvedCount++;
    continue;
  }
  const slug = path.basename(file, '.md');
  gated.push({ slug, level: fields.level, decision: addressed.get(slug) ?? null });
}

const unaddressed = gated.filter((c) => !c.decision);
if (gated.length > 0 && !fixlogExists) {
  fail(
    `audit ${latestRun} has ${gated.length} open major/moderate concern(s) and no FIXLOG.md — run /audit-fix`,
  );
}
if (unaddressed.length > 0) {
  console.error(`audit-gate: FAIL — unaddressed major/moderate concerns in audit ${latestRun}:`);
  for (const c of unaddressed) console.error(`  - ${c.slug} (${c.level})`);
  console.error('run /audit-fix to address them');
  process.exit(1);
}

const stamp = {
  branch,
  auditTimestamp: latestRun,
  headSha: git('rev-parse HEAD'),
  generatedAt: new Date().toISOString(),
  majorModerate: {
    resolved: resolvedCount + gated.filter((c) => c.decision === 'fixed').length,
    ignored: gated.filter((c) => c.decision === 'ignored').length,
  },
};
fs.writeFileSync(STAMP_PATH, JSON.stringify(stamp, null, 2) + '\n');

console.log(
  `audit-gate: PASS — audit ${latestRun} on '${branch}': ` +
    `${stamp.majorModerate.resolved} major/moderate concern(s) resolved, ` +
    `${stamp.majorModerate.ignored} ignored`,
);
console.log(`stamp written to ${path.relative(repoRoot, STAMP_PATH)} — commit it with the branch`);
