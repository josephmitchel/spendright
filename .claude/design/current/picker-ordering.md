---
name: picker-ordering
description: Card categories are listed best-earning first (ties alphabetical); credit categories alphabetical
tags: [GET /api/cards, src/app/api/cards/route.ts, orderBy]
date: 2026-09-04
---

`/api/cards` orders card categories by rate descending then name, and credit categories by name, so picker order is stable across reloads and seed runs.
