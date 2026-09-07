---
name: migrations-append-only
description: Committed drizzle migrations are frozen — schema changes are always a new generated migration, never an edit to an existing file under drizzle/
tags: [drizzle/, drizzle-kit generate, db:generate, db:migrate, __drizzle_migrations]
date: 2026-09-06
---

Adopted 2026-09-06 after a quality audit found `drizzle/0003_abnormal_dakota_north.sql` had been edited (comment-only) after later migrations were already committed. Harmless in practice — drizzle applies by journal timestamp, not stored hash — but it breaks the ledger's ability to say whether an applied migration still matches its source.

The rule: once a migration file is committed, it is never edited; every schema change is a fresh `npm run db:generate` producing a new numbered file, applied with `npm run db:migrate`. The 0003 edit stands as-is (reverting it would be another edit); this record exists so the next one doesn't happen.
