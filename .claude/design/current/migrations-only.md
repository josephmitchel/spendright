---
name: migrations-only
description: Schema changes go through generated drizzle migrations (drizzle-kit push is rejected), and committed migration files are frozen — every change is a new generated migration, never an edit to an existing file under drizzle/
tags: [npm run db:generate, npm run db:migrate, drizzle/, drizzle.config.ts, drizzle-kit generate, drizzle migrations table]
date: 2026-09-04
---

Migrations carry hand-written data statements (0003 backfills wrong-kind category state before adding the sign constraint), which `push` would skip. `db:generate` then `db:migrate` is the only path. See [[drizzle-kit-push]] in retired.

## Migrations are append-only (adopted 2026-09-06)

Adopted 2026-09-06 after a quality audit found `drizzle/0003_abnormal_dakota_north.sql` had been edited (comment-only) after later migrations were already committed. Harmless in practice — drizzle applies by journal timestamp, not stored hash — but it breaks the ledger's ability to say whether an applied migration still matches its source.

The rule: once a migration file is committed, it is never edited; every schema change is a fresh `npm run db:generate` producing a new numbered file, applied with `npm run db:migrate`. The 0003 edit stands as-is (reverting it would be another edit); this record exists so the next one doesn't happen.
