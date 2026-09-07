---
name: item-logo-served-separately
description: GET /api/items serves a hasLogo flag instead of the base64 institution logo; the bytes come from GET /api/items/[itemId]/logo with a day-long private cache
tags: [hasLogo, publicItemColumns, itemLogo, src/lib/items.ts, base64ImageMime, items.institution_logo]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 performance audit found the base64 `institution_logo` blob riding every 60-second poll of `GET /api/items`, for every institution, indefinitely — unconditional waste for an effectively static asset ([[relink-preserves-institution-metadata]]: it only changes on link/relink), and it invalidated [[home-reflects-background-sync]]'s "small loopback reads" justification for polling. The user chose splitting over ETags. `publicItemColumns` (src/lib/items.ts) now excludes the logo column and serves a computed `hasLogo` flag; the home page renders `<img src="/api/items/[itemId]/logo">` when it's set. The logo route decodes the stored base64, sniffs the MIME type (`base64ImageMime` — unknown formats 404 rather than render), and answers with `Cache-Control: private, max-age=86400`, so a browser fetches each logo about once a day instead of every poll. Accepted consequence: after a relink changes a logo, the old image can linger in the browser cache up to a day — cosmetic, and self-healing.
