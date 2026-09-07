---
name: deployment-boundaries
description: The accepted current-stage architectural boundaries audits keep re-flagging — no tenant scoping, unprefixed public-schema tables, single-process scheduler/single-flight state, offset pagination, unconditional 60s polling, code-only card-catalog drift recovery — each with its revisit trigger
tags:
  [DATABASE_URL, useVisiblePoll, src/lib/pagination.ts, matchCard, syncAllItems, globalSingleton]
date: 2026-09-07
---

Confirmed 2026-09-07, consolidating boundary findings from the 2026-09-07 audit so future audits treat them as accepted decisions rather than fresh gaps. Each holds for the current single-user, single-process, localhost deployment ([[single-user-localhost-no-auth]]) and names what changes it:

- **No user/tenant scoping.** No table carries a user id; the only "user" is the fixed `client_user_id` sent to Plaid. Multi-user support is not "add auth" — it is a migration touching every table's unique constraints and every query in src/lib. Revisit trigger: any second user.
- **Unprefixed tables in Postgres's `public` schema.** The app assumes a dedicated database (per `.env.example`'s convention); pointing `DATABASE_URL` at a shared instance risks name collisions with no structural guard. Revisit trigger: sharing a Postgres instance with anything else.
- **Single-process coordination state.** The hourly scheduler flag and the sync-all single-flight slot live in `globalSingleton` memory. Per-item _correctness_ is cross-process ([[cross-process-sync-lock]]); what stays process-local is dedupe/join convenience — multiple replicas would each run their own scheduler and could run overlapping sync-alls, safe per item but duplicative. Revisit trigger: more than one server process by design (replicas, serverless).
- **Offset pagination and unconditional 60s polling.** `LIMIT/OFFSET` paging ([[transactions-paginated]]) costs proportionally to page depth, and `useVisiblePoll` re-fetches without change detection ([[home-reflects-background-sync]]) — both accepted at current data volume and tab count. Revisit triggers: multi-year accumulated history for keyset paging; more than a couple of concurrently open clients for ETag/304.
- **Card-name drift recovery is code-only.** An institution-side product rename silently unmatches an account ([[account-card-matching-by-name]], [[unmatched-is-temporary]]) and the only repair is editing the seed and re-running it ([[operator-is-developer]]). Revisit trigger: the same non-developer-user trigger, or the first real rename incident.
