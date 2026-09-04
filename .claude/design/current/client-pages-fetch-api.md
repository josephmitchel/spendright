---
name: client-pages-fetch-api
description: Pages fetch from the app's own /api routes; no page reads the database directly
tags: [HomeClient, src/app/page.tsx, src/app/accounts/[accountId]/page.tsx, use client]
date: 2026-09-04
---

The rule is data access, not file shape: all data comes over fetch from `/api/*`, all mutations go through the API, and a server-side database read in a page is not the pattern. A page may be a client component itself (`accounts/[accountId]/page.tsx`) or a server component that only renders one (`page.tsx` → `HomeClient`); both shapes are fine (confirmed 2026-09-04).
