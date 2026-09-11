import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

interface JournalEntry {
  when: number;
  tag: string;
}

// drizzle's migrator records each applied migration's journal `when` in
// drizzle.__drizzle_migrations.created_at (Verified-on: drizzle-orm@0.45.2,
// pg-core/dialect.js migrate()).
export async function assertMigrationsApplied(pool: Pool): Promise<void> {
  const journalPath = path.join(process.cwd(), 'drizzle', 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: JournalEntry[] };

  let applied: Set<string>;
  try {
    const { rows } = await pool.query<{ created_at: string }>(
      'select created_at from drizzle.__drizzle_migrations',
    );
    applied = new Set(rows.map((row) => String(row.created_at)));
  } catch (err) {
    // 42P01 undefined_table: nothing was ever migrated.
    if ((err as { code?: string }).code === '42P01') {
      throw new Error(
        'the database has no applied migrations — run `npm run db:migrate` and restart',
      );
    }
    throw err;
  }

  const missing = journal.entries.filter((entry) => !applied.has(String(entry.when)));
  if (missing.length > 0) {
    throw new Error(
      `the database is missing ${missing.length} migration(s) ` +
        `(${missing.map((entry) => entry.tag).join(', ')}) — run \`npm run db:migrate\` ` +
        'and restart',
    );
  }
}
