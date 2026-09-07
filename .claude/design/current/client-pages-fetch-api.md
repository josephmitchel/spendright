---
name: client-pages-fetch-api
description: Pages fetch from the app's own /api routes and no page reads the database directly; each page.tsx is itself the client component, with its page-specific hooks and components colocated in its route directory
tags: [src/app/page.tsx, src/app/accounts/[accountId]/page.tsx, use client, src/components, src/hooks]
date: 2026-09-04
---

The data rule: all data comes over fetch from `/api/*`, all mutations go through the API, and a server-side database read in a page is not the pattern.

The file-shape rule (unified 2026-09-06, replacing the earlier "both shapes are fine": the home page had a server shim rendering `HomeClient` from `src/components/` while the account page was a `'use client'` page with colocated hooks): every `page.tsx` is itself the client component, and page-specific hooks and components live in that route's directory beside it (`src/app/` for the home page, `src/app/accounts/[accountId]/` for the account page). Genuinely shared client modules live outside the route directories: shared hooks in `src/hooks/` (`useLoadProtocol`, `useVisiblePoll`, `useAsyncAction`), shared components in `src/components/` (`ErrorNotice`). The next page's hook goes in the next page's directory.
