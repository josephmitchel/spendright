---
name: unstyled-for-now
description: The UI is deliberately unstyled for now: plain HTML tables, native selects, alert and confirm
tags: [src/app/layout.tsx, HomeClient, src/app/accounts/[accountId]/page.tsx, alert, confirm]
date: 2026-09-04
---

There is no CSS, no component library, and no design system yet. Error alerts use `alert()`, the remove confirmation uses `confirm()`. This will change, but until it does the lack of styling is not an audit finding. Layout choices that exist (fixed table columns) are functional, not visual.
