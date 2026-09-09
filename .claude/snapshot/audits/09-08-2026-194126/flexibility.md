---
characteristic: 'flexibility'
---

# Summary

All three prior Minor concerns are verified resolved by all three auditors: the sync-concurrency/pool-size invariant is now a load-time assertion (`src/lib/sync-all.ts:30-36`) rather than a comment, the chunk-size duplication is unified behind `DB_CHUNK_SIZE` in `src/lib/chunk.ts`, and Plaid Link language is now env-configurable via `PLAID_LANGUAGE` (`src/lib/plaid.ts:114-116`). Config surfaces are env-driven and validated against real enums/patterns; the `CardType`/`CategoryKind` extension points remain compiler-exhaustive; the Plaid SDK stays isolated behind its single seam. One auditor raised a new Minor that is the same structural pattern the prior era fixed twice: another load-bearing cross-file numeric constant enforced only by comment.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[new]` **Node major-version pin duplicated across three unenforced sources.** `src/lib/env.ts:1-14` (`SUPPORTED_NODE_MAJOR = 24`), `package.json` (`"engines": { "node": "24.x" }`), and `.nvmrc` (`24`) are three independently hand-maintained copies of the same installability constraint, tied together only by a "keep in sync" comment. This is the same pattern flagged and fixed twice last era (concurrency/pool, chunk size): a bump to one file without the others produces either a false rejection or a silent gap. Suggested fix mirrors those: have `env.ts` read the version from `package.json` rather than restating it.

# Resolved since prior audit

- `[prior → resolved]` Sync-concurrency/pool-size invariant — now mechanically asserted at module load.
- `[prior → resolved]` Chunk-size duplication — single `DB_CHUNK_SIZE` constant.
- `[prior → resolved]` Hardcoded Plaid Link language — now reads `PLAID_LANGUAGE` with `'en'` fallback.
