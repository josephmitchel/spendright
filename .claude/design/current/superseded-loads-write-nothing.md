---
name: superseded-loads-write-nothing
description: A load superseded by a newer one writes nothing; every fetch effect is guarded by a generation counter or a cancelled flag
tags: [refreshSeq, HomeClient refresh, cancelled, settledRequest, src/app/accounts/[accountId]/page.tsx]
date: 2026-09-04
---

`HomeClient.refresh` takes a ticket from the `refreshSeq` generation counter and discards its results if a later refresh has started. The account page's load effects set a `cancelled` flag in cleanup, and `settledRequest` is keyed on both effect inputs (`{page, reloadKey}`) so a Retry of the same page still counts as in flight. Sibling of [[partial-load-rendering]]: that record decides what renders when reads fail; this one decides which read is allowed to write state at all.
