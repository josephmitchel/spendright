---
name: drizzle-kit-push
description: Applying schema with drizzle-kit push
tags: [drizzle-kit push, npm run db:migrate]
date: 2026-09-04
---

Push applies only the schema diff and skips hand-written data statements, so the sign constraint would fail to apply on a database with legacy rows. Replaced by [[migrations-only]].
