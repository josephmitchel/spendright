---
name: client-pages-fetch-api
description: Pages are client components that fetch from the app's own /api routes; no page reads the database directly
tags: [HomeClient, src/app/page.tsx, src/app/accounts/[accountId]/page.tsx, use client]
date: 2026-09-04
---

The server page components only render a client component. All data comes over fetch from `/api/*`, and all mutations go through the API. Server-side data reads in pages are not the pattern.
