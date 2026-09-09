---
characteristic: 'functional suitability'
---

# Summary

Three auditors independently confirmed that both prior Minor concerns (non-sticky `loaded` flags dropping established views on transient poll failures, on both the home page and the account detail page) are resolved via `stickyKeys` in `useHomeData.ts:34` and `useAccountData.ts:48`. All three traced the full functional surface (sync engine, card/category matching, API routes, pagination, money formatting, client state machines) against SNAPSHOT.md and found it tracking the specification with high fidelity. Two new Moderate concerns emerged: one is a genuine regression introduced by the sticky-flags fix itself, and one is a gap between a documented seed-validation guarantee and the implemented checks.

# Major Concerns

None.

# Moderate Concerns

- `[new]` **Stale-lists-disable-editing guarantee broken by the stickyKeys fix.** `src/app/accounts/[accountId]/page.tsx:136` computes `categoriesMayBeStale` from `loaded.cards`/`loaded.account`, but making those keys sticky (`useAccountData.ts:48` — the fix for the prior view-flicker findings) means they latch true permanently after the first successful load. SNAPSHOT.md specifies that a failed account/cards read disables both category pickers with a "stale lists disable editing" notice; that guard is now unreachable in the steady state — a later failed poll never disables editing or shows the notice. The same `loaded` flags are being reused for two purposes (view stability vs. write-safety gating) that need different semantics; recommend a separate non-sticky "last read succeeded" signal for the staleness gate. (The server remains the ultimate guard on stale picks.)

- `[new]` **Seed validation does not enforce duplicate/blank card display names despite SNAPSHOT.md documenting it.** `scripts/seed-cards.ts:37-45` — `assertSeedIsValid` checks `seed.slug` uniqueness (using `seed.name` only as the error-message label) but never validates `cardSeeds[].name` for blankness or cross-card duplication, and `cards.name` (`src/db/schema.ts:23`) is `notNull()` only, which does not reject `''`. SNAPSHOT.md claims "Seed validation fails loudly: duplicate/blank slugs, names, claimed Plaid names." Low current exploitability with a single-card catalog, but worth closing before a second card lands — exactly the event the snapshot's revisit triggers name.

# Minor Concerns

None.

# Resolved since prior audit

- `[prior → resolved]` Home page losing "No institutions connected yet." on a poll hiccup — `useHomeData.ts:34` now passes `stickyKeys: ['items', 'accounts']`.
- `[prior → resolved]` Same non-sticky defect on the account detail page — `useAccountData.ts:48` now passes `stickyKeys: ['account', 'cards']`.
