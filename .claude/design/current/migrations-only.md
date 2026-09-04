---
name: migrations-only
description: Schema changes go through generated drizzle migrations; drizzle-kit push is rejected
tags: [npm run db:generate, npm run db:migrate, drizzle/, drizzle.config.ts]
date: 2026-09-04
---

Migrations carry hand-written data statements (0003 backfills wrong-kind category state before adding the sign constraint), which `push` would skip. `db:generate` then `db:migrate` is the only path. See [[drizzle-kit-push]] in retired.
