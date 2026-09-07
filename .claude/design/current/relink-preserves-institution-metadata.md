---
name: relink-preserves-institution-metadata
description: On re-link, institution metadata that failed to fetch is left as stored rather than overwritten with null
tags: [src/lib/link.ts, storeItem, institutionUpdate, getInstitutionById, items.institution_logo]
date: 2026-09-04
---

`institutionsGetById` may fail and is not fatal. On the conflict-update path the logo, colour, name and id are written only when a value was actually obtained. A read that failed is not evidence of what it would have returned. Same principle as [[partial-load-rendering]].
