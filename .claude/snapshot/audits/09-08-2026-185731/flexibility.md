---
characteristic: "flexibility"
---
# Summary

Three auditors assessed Adaptability, Scalability, Installability, and Replaceability. The codebase's deliberate inflexibilities (single-user, single-process, single-card, no export, Plaid non-abstracted) are all pre-declared in SNAPSHOT.md with revisit triggers and were not re-raised. The genuinely flexible parts held up under inspection: the card catalog is fully data-driven (the single card is a data decision, not a logic constraint — grep-verified that no card name leaks outside `cards.seed.ts`), `CardType`/`CategoryKind` are compiler-exhaustive extension points, Plaid products/regions are env-configurable against SDK enums, money formatting adapts to the runtime locale, and the README's migration-baselining procedure is an installability strength. Two of three auditors converged on the same single finding; the third considered the same coupling adequately discoverable via comments. All findings are `[new]` (first audit of the era).

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[new]` **The sync-concurrency/pool-size invariant is enforced only by comments across two files.** `src/lib/pool-config.ts:11-16` sets `POOL_CONFIG.max = 10`; `src/lib/sync-all.ts:31` independently sets `SYNC_CONCURRENCY = 3` (each in-flight item holding up to 2 connections). The snapshot itself calls the coupling load-bearing ("raising concurrency or shrinking the pool must revisit both together"), but no shared constant, derived value, or startup assertion ties them together — unlike the other sync budgets in `sync-lock.ts`, which are derived arithmetically. A future change to either constant can silently violate the other's assumption, surfacing as pool-timeout errors under load. A one-line startup assertion (`SYNC_CONCURRENCY * 2 <= POOL_CONFIG.max`) would make the invariant self-enforcing. (Raised independently by two auditors.)
