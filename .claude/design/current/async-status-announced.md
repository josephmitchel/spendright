---
name: async-status-announced
description: Async state changes are announced to assistive tech via a hybrid live-region pattern
tags: [ErrorNotice, PlaidLinkButton, useSyncAll, Pager, TransactionTable, live regions, aria roles]
date: 2026-09-07
---

Every async operation's start/success/failure is exposed to screen readers (WCAG status messages), using a hybrid pattern confirmed 2026-09-07:

- Errors render conditionally with `role="alert"` — alerts announce reliably on DOM insertion. `ErrorNotice` carries it for all shared errors; per-row patch failures in `TransactionTable` carry it directly.
- Status/progress text (connect/exchange progress and sync notice in `PlaidLinkButton`, sync status on the home page, pager "Loading…") lives inside an always-mounted `role="status"` wrapper whose *content* toggles, because a status region mounted already containing its text is not reliably announced.

Rejected alternatives: decorating conditional status elements in place (unreliable announcement) and a centralized visually-hidden announcer (infrastructure and CSS that clash with [[unstyled-for-now]] at this stage). New async UI must follow this pattern: alerts may mount with content; status regions must exist before their text appears.
