---
name: blanket-error-suppression
description: Suppressing every error message to the client, including the app's own user-facing ones
tags: [errorResponse, PublicError, src/lib/errors.ts]
date: 2026-09-04
---

The first version of the err.message suppression blanked app-authored messages too, turning "Plaid is still preparing transactions" into "Internal server error". Replaced by the allow-list in [[error-message-allow-list]].
