---
characteristics: [maintainability]
level: minor
status: resolved
first-seen: 09-08-2026-213020
locations:
  - scripts/load-env.ts:6
---

# dotenv promotional tips pollute maintenance-script output

Both `config()` calls in `scripts/load-env.ts` omitted `{ quiet: true }`,
letting dotenv's promotional-tip banner interleave with the app's deliberate
`logInfo` output on every `npm run seed:cards` and `npm run rotate:key`.

**Verified fixed** by all three maintainability auditors independently:
`scripts/load-env.ts:6-7` now reads
`config({ path: '.env.local', quiet: true });` followed by
`config({ quiet: true });` — both calls pass `{ quiet: true }`, exactly the
suggested one-line fix.
