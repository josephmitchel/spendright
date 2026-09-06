---
name: unstyled-for-now
description: The UI is deliberately unstyled for now: plain HTML tables, native selects, confirm
tags: [src/app/layout.tsx, HomeClient, src/app/accounts/[accountId]/page.tsx, confirm]
date: 2026-09-04
---

There is no CSS, no component library, and no design system yet. Error messages render inline on the page; the remove confirmation uses `confirm()`. (Corrected 2026-09-06: an earlier version said error alerts use `alert()` — no `alert()` remains in the code.) This will change, but until it does the lack of styling is not an audit finding. Layout choices that exist (fixed table columns) are functional, not visual.
