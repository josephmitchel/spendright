---
characteristic: 'functional suitability'
---

# Summary

Both Moderate concerns from the previous audit are resolved: the stale-lists-disable-editing guarantee is restored (`src/hooks/useLoadProtocol.ts` now exposes a non-sticky `fresh` signal, and `src/app/accounts/[accountId]/page.tsx:138` gates `categoriesMayBeStale` on it while view stability still uses the sticky `loaded` flags), and seed validation now enforces duplicate/blank card display names (`assertUniqueKeys` on `cardSeeds[].name` in `scripts/seed-cards.ts:46-52`).

Fresh passes across the sync engine (cursor hold/drop-after-5, single-flight, per-item advisory locks, pending→posted carry, conflict-set kind-flip nulling), card/category matching and the kind-sign rule, the full API surface (validation, ordering, clamping, error envelope), money formatting, client state machines, and the data model found the implementation matching SNAPSHOT.md's documented behavior precisely — with one exception below: one auditor found a cosmetic mismatch between the documented "unknown image formats 404, not render" behavior and what the client actually shows.

# Major Concerns

None.

# Moderate Concerns

None.

# Minor Concerns

- `[new]` **`hasLogo` doesn't reflect whether the logo is actually renderable, so an unrecognized logo format renders a broken-image icon instead of nothing.** `src/lib/items.ts:20` computes `hasLogo` from mere presence of `institutionLogo`, but the logo route (`src/app/api/items/[itemId]/logo/route.ts:16-19`) 404s when `base64ImageMime()` doesn't recognize the magic bytes (only png/jpeg/gif/webp). The home page (`src/app/page.tsx:85-88`) emits an `<img>` whenever `hasLogo` is true with no `onError` handler, so a logo in an unrecognized format shows a broken-image glyph rather than being gracefully omitted — a mismatch with SNAPSHOT.md's stated "Unknown image formats 404, not render." Cosmetic impact only (empty `alt`, 24×24 icon).
