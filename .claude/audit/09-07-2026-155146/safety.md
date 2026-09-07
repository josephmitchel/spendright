---
characteristic: "safety"
---
# Summary

All five auditors converged on the same scoping: for a single-user, read-only-to-Plaid finance tool with no funds movement, ISO/IEC 25010 §3.9 "safety" reduces to **property** — whether the app can mislead its user into a bad financial decision by presenting incorrect, stale, or unqualified figures as trustworthy. Within that lens, the existing posture is strong: prior hardening covers bounded cursor-hold with progressive drop warnings, per-item failure isolation, fail-closed config validation, an accurate `confirm()` on the one destructive action, and a stale-balance warning mechanism (`ACCOUNT_REFRESH_FAILED_MESSAGE`).

No Major findings. The consistent theme across auditors is that the hazard-warning machinery that exists **doesn't reach the surfaces where the user actually makes decisions**: the account detail page shows balances with no path to the staleness warning, the background sync can fail invisibly, no "as of" timestamp exists anywhere, and the flat reward-rate model silently overstates rates past real-world caps.

# Major Concerns

None found by any of the five auditors.

# Moderate Concerns

- **Account detail page shows balances with no path to the staleness warning that exists for the same data on the home page** (flagged by 2 of 5, re-verified against the prior audit — this gap was not fixed in the last remediation commit) — `src/app/accounts/[accountId]/page.tsx:44-60` renders `balanceCurrent`/`balanceAvailable`/`balanceLimit` unconditionally. On refresh failure, `src/lib/sync-outcome.ts:29-32` writes `ACCOUNT_REFRESH_FAILED_MESSAGE` to `items.error`, rendered only on the home page (`src/app/page.tsx:89`); `GET /api/accounts/[accountId]` never joins `items` and `useAccountData.ts:20-43` never fetches item state. The page a user checks before a spending decision is exactly the one the warning can't reach. Fix shape: include the parent item's error/staleness in the account API and render the same warning in `AccountIdentity`.

- **Scheduled background sync swallows whole-run failures with zero user-visible signal** — `src/lib/sync-all.ts:22` selects items *before* the per-item try/catch, so a DB-down/pool-exhausted failure rejects the whole run before any `items.error` is written; the scheduler (`src/lib/sync-scheduler.ts:25-27`) only `logError`s it. The UI keeps showing last-fetched balances indefinitely with no banner, across every subsequent failing hourly tick. The manual path surfaces the identical failure via `useSyncAll`/`ErrorNotice` — the same event is handled on one path and silently dropped on the other. This is precisely the "syncs fail silently" mode `scheduled-sync.md` cites as the reason an OS-level scheduler was rejected.

- **No indication anywhere in the UI of when balances were last refreshed** (flagged by 2 of 5) — `accounts.updatedAt` is already selected into the served row (`src/lib/accounts.ts:27`) but never rendered; `grep` confirms no client code reads it. If the app hasn't run recently (sync only happens manually or while the process is alive), the user sees stale figures with no cue — and the active warning path above is itself the thing that can fail. A passive "as of ⟨updatedAt⟩" label is an always-available, independent freshness signal.

- **Flat reward-rate model presents rates as fact past real-world caps** (flagged by 3 of 5; also the top Functional Suitability finding) — `src/db/schema.ts:40` has no cap/threshold concept; the seeded Amex Blue Cash Preferred's 6% categories cap at $6,000/year then drop to 1%; the rate is written verbatim per transaction (`src/lib/categories.ts:50`) and displayed unconditionally (`TransactionTable.tsx:53-65`). Once cumulative spend crosses a cap the app asserts a materially wrong, too-generous rate indefinitely — a direct path to a financially suboptimal card choice based on the app's own guidance.

# Minor Concerns

- **The rendered warnings point to remediation the user can't perform** — "check the server log" (`sync-outcome.ts:30-32`, `sync-messages.ts:5-28`); no in-app-actionable alternative (e.g. "re-link this connection") is offered (also raised under Interaction Capability).
- **All error severities render with identical weight** — `ErrorNotice.tsx:12-23` shows a transient blip, a recoverable skip, an irreversible post-`MAX_SKIPPED_SYNCS` drop, and a systemic `BAD_CONFIG` (rotated key breaking all syncs) as one undifferentiated paragraph.
- **`seed-cards.ts` reconcile is destructive-by-default with no confirmation, dry-run, or environment echo** — `scripts/seed-cards.ts:95-116,186-244`; a misdirected `DATABASE_URL` or truncated seed file silently retires the live catalog (bounded: retirement not deletion, historical categorization preserved).
- **No guard against a semantically wrong seed mapping** — `matchCard` (`src/lib/cards.ts:8-18`) matches on name equality alone; a wrong/duplicate `plaidAccountNames` entry silently attaches transactions and reward reporting to the wrong card; `assertSeedIsValid` can't catch it.
- **Seeded reward rates have no re-verification mechanism against issuer terms** — the `Verified-on:` tooling covers code-internals claims but nothing flags when `cards.seed.ts` rates drift from reality as issuers change their programs.
- **`kindForAmount` routes NaN silently to 'card'** — `src/lib/category-kinds.ts:6-9`; documented as intentional, but a malformed upstream amount would be categorized and reward-rated as ordinary spend with no data-quality flag.
- **No duplicate-institution guard at link time** — `src/app/api/exchange/route.ts:8-24`; re-linking the same institution creates a second independently syncing item row; upserts by Plaid IDs make double-counting unlikely, but nothing rules it out or records the risk.

# Verified sound (explicitly checked)

Bounded cursor-hold with `MAX_SKIPPED_SYNCS = 5` and progressive escalation before an explicit, logged drop; per-item failure isolation in `runSyncAll`; fail-closed config validation (`crypto.ts`, `env.ts`, `plaid.ts` — the app throws rather than silently defaulting into Plaid production); accurate cascade wording in the removal `confirm()`; reward-rate unit resolved through a single `card.type` branch; stale category lists disabling (not hiding) editing; request deadlines closing the "wedged forever" mode.
