---
characteristic: "safety"
---
# Summary

All three auditors agreed the ISO 25010 Safety characteristic has limited surface area here: SpendRight is a read-only aggregator with no payment initiation, transfers, or automated financial decisions, so life/health/environment hazards don't apply and "property" reduces to the integrity of the user's financial data and decisions. Within that framing, the existing fail-safe engineering was verified as strong: bounded retries and pagination, sandbox-by-default `PLAID_ENV`, fail-closed config validation, Plaid-first deletion, stale-data edit disabling, soft-delete-only reconciliation, and encrypted-never-served tokens. One auditor found a genuine hazard-warning gap (moderate); the rest is minor. This conclusion should be revisited if the app ever gains features that act on the user's money (bill pay, recommendations driving real spending, payment initiation).

# Major Concerns

None found by any auditor.

# Moderate Concerns

- **Stale-balance warning never reaches the account detail page** (1 auditor) — `src/lib/sync-outcome.ts` sets `ACCOUNT_REFRESH_FAILED_MESSAGE` ("balances may be stale") on `items.error` specifically so a failed refresh isn't invisible, but it renders only on the home page. The account detail page (`src/app/accounts/[accountId]/page.tsx`) shows `balanceCurrent`/`balanceAvailable`/`balanceLimit` — the numbers a user would act on — with no connection to item error state, and `GET /api/accounts/[accountId]` (`AccountPayload` in `src/lib/api-types.ts`) doesn't carry it. A user navigating directly to an account can see confidently rendered stale balances with zero indication. Notably, `accounts-refreshed-per-sync.md` records this exact failure class being fixed once for the home page ("previously log-only"); the fix didn't reach the page where the numbers are used.
- **The stale-balance warning's remediation is "check the server log"** (1 auditor) — even where shown, the warning points to a resource the end user of a finance app can't act on in-app, weakening its practical effect. (Same pattern flagged in the interaction-capability report.)

# Minor Concerns

- **Item errors rendered as undifferentiated text** (2 auditors, overlapping) — the home page funnels every `item.error` (informational stale-balance notice, skipped-sync notice, dropped-after-`MAX_SKIPPED_SYNCS` condition, arbitrary Plaid error) into one generic `Item error: …` paragraph, and `src/components/ErrorNotice.tsx` gives systemic failures (e.g. `BAD_CONFIG` from a rotated `ENCRYPTION_KEY`, which breaks all future syncs) identical visual weight to a one-row PATCH failure. A user could miss that their connection was actually dropped and needs re-linking.
- **`scripts/seed-cards.ts` has no confirmation or `--dry-run` gate** (1 auditor) — `npm run seed:cards` immediately retires anything absent from the seed file, including everything in scope if a list is emptied by mistake. Impact is bounded (soft-delete via `retired_at`, logged, per `categories-retired-not-deleted`), but there's no operator-error guard before it acts on a live database.
- **Category mis-mapping in the seed has no check** (1 auditor, observational) — a reward category attached to the wrong card in `src/db/cards.seed.ts` isn't detectable anywhere; noted as a data-accuracy concern rather than a safety finding since no automated decisions are made from it.
