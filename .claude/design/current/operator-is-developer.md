---
name: operator-is-developer
description: User-facing remediation text may direct the operator to developer actions — editing cards.seed.ts, running seed:cards, checking the server log — because the sole operator is the maintainer at this stage; revisit before any non-developer user exists
tags: [cards.seed.ts, seed:cards, src/lib/sync-messages.ts, skippedItemErrorMessage]
date: 2026-09-07
---

Confirmed 2026-09-07: the 2026-09-07 interaction-capability audit flagged that several user-facing messages embed developer remediation — the unsupported-account notice tells the user to edit `src/db/cards.seed.ts` and run `npm run seed:cards`, and the skip/refresh-failure messages in src/lib/sync-messages.ts say to check the server log — steps ISO's notion of an end user cannot take from inside a running web app. This is accepted as deliberate for the current stage: the app is single-user ([[single-user-localhost-no-auth]]), the user is the developer, and the messages name the fastest real fix rather than a softer dead end. The card-catalog half is already structural ([[card-catalog-in-code]], [[account-card-matching-by-name]]). Revisit trigger: the moment any non-developer is expected to operate the app, these messages need in-app paths (a manual card-assignment control, an in-app log/status surface) rather than reworded text.
