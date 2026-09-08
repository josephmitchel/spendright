---
characteristic: 'safety'
---

# Summary

All three auditors independently reported clean passes against the Safety subcharacteristics (Operational Constraint, Risk Identification, Fail Safe, Hazard Warning, Safe Integration), with the user's financial data and the decisions made from it as the property at risk. Verified mechanisms: fail-safe behavior (`decrypt()` throws actionable errors rather than returning garbage; unhandled rejections trigger log-and-exit; `start.mjs` supervises with a warm-up probe and a 3-exits/60s crash-loop guard), operational constraints (the `transactions_category_kind_sign_ck` CHECK constraint as a DB-level backstop, with `conflictSetForKind` correctly clearing wrong-kind columns on sign flips; row-locked category writes; every Postgres/network wait bounded with server-side cancels winning), hazard warnings (native `confirm()` naming exactly what a removal deletes, per-account balance freshness stamps before spending decisions, stale category lists disabling pickers with notices while the server independently re-validates), safe integration (TLS required for remote DB, encrypted tokens, startup config validation, durable item shell before enrichment), and seed integrity (reward rates bounds-checked at 0 < rate ≤ 20 plus a mandatory human `ratesVerified` attestation — a tripwire against a typo shipping as authoritative financial guidance). Destructive flows are idempotent and de-duplicated. Every mechanism matched SNAPSHOT.md's documented design; all three auditors called this a genuine no-findings result.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

None.
