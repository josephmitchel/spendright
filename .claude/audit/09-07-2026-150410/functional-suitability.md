---
characteristic: "functional suitability"
---
# Summary

An essentially clean result. All three auditors traced the core domain logic (sign-based category-kind routing and its DB check constraint, pending→posted carry, bounded cursor hold/skip/drop counting, optimistic category-write burst/settle reconciliation, seed retire/revive reconciliation, pagination clamping, card matching and rematch, token-before-enrichment link sequencing, item-delete Plaid-first) and found the implementation consistently matches the design records — no divergence between `.claude/design/current/` and code was found anywhere. No missing core flows, no materially wrong calculations. One auditor found a genuine moderate correctness bug (a concurrency error-slot pattern the project already fixed once elsewhere), and two auditors independently found the same minor stale-`card` race in `useAccountData`.

# Major Concerns

None found by any auditor.

# Moderate Concerns

- **Concurrent institution removals can silently erase each other's error notice** (1 auditor) — `useAsyncAction` keeps one shared `error` slot and `run()` unconditionally calls `setError(null)` on every invocation (`src/hooks/useAsyncAction.ts:26`). `useItemRemoval` passes a per-`itemId` key (`src/app/useItemRemoval.ts:17`), deliberately allowing two removals to run concurrently — but the error slot isn't keyed. If institution A's removal fails and the user then removes institution B, B's `run()` wipes A's error; if B succeeds, the user is left with A still listed and no visible explanation. This reproduces exactly the bug pattern `optimistic-category-writes.md` documents fixing for category edits ("the original single shared error slot let concurrent edits on different rows silently clear one another's failures") — the fix was never applied to `useAsyncAction`. Fix shape: key the error map by the same key used for the in-flight guard and render per-item errors instead of the single global `<ErrorNotice>` (`src/app/page.tsx:131`).

# Minor Concerns

- **`useAccountData` can show a stale `card` when one of its two reads fails** (2 auditors independently) — `setCard` only recomputes when *both* `bodies.account` and `bodies.cards` succeed in the same settle (`src/app/accounts/[accountId]/useAccountData.ts:33–38`). If a sync's rematch changes the account's `cardId` (or drops the match) on the same 60s poll tick that the `/api/cards` read fails, the page keeps rendering the old card's name/rate-unit header — or stays in the "ready" view instead of transitioning to "Card not supported" — until a later poll succeeds on both reads. `categoriesMayBeStale` correctly disables the pickers in this window, so no bad write can occur; the informational rendering is transiently wrong. Low-probability, self-healing. Suggested fix: recompute `card` whenever `bodies.account` succeeds using the last-known-good cards list, or carry a stale flag on `card` consistent with `categoriesMayBeStale`.
- **Stated purpose not yet implemented** (1 auditor, awareness only) — the README frames SpendRight around "credit card spending optimization," but no code path computes anything optimization-related (no rewards totals, comparisons, or best-card guidance); today the app records a static per-category rate per transaction. Deliberate staged build-out per project memory (`single-card-catalog.md`); a completeness note, not an action item.
