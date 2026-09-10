---
characteristics: [maintainability]
level: minor
status: new
first-seen: 09-08-2026-213020
locations:
  - scripts/load-env.ts:4
---

# dotenv promotional tips pollute maintenance-script output

Both `config()` calls in `scripts/load-env.ts:4-5` omit `{ quiet: true }`, so `dotenv@17.4.2`'s built-in promotional-tip feature fires on every `npm run seed:cards` and `npm run rotate:key` invocation — third-party text including an external URL (verified live: `injected env (7) from .env.local // tip: ⌁ auth for agents [www.vestauth.com]`) interleaved with the app's own deliberate `logInfo` output. This is a benign dependency feature, not a compromise, but it cuts against the repo's otherwise careful log hygiene (every other log call routes through `src/lib/log.ts`; no stray `console.*` anywhere else). Impact is limited to maintenance-script stdout. Suggested direction: pass `{ quiet: true }` to both `config()` calls.
