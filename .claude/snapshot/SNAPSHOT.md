---
date: 2026-09-08
branch: owasp-iso
---

# Overview

SpendRight is a personal finance app centered on credit-card spending optimization,
in very early stages. It is a single-user tool run on localhost by its own developer.
Today it implements the data-collection half of its premise — linking banks via Plaid,
syncing transactions, and hand-categorizing them against a one-card reward catalog —
faithfully and defensively. The optimization half (aggregation, actual-vs-optimal
comparison) is deliberately deferred until the single-card flow is proven right.
The app is deliberately unstyled.

# Features

## Connecting a bank (Plaid Link)
- Link flow stores the encrypted access token in a minimal item row **before**
  enrichment, so an enrichment failure never strands a live Plaid item behind a
  discarded token. Enrichment reads run in parallel; failures are recorded on the
  item (`setup_failed` distinguishes them from first-sync failures), never thrown —
  the route answers 200 once the item exists.
- First sync runs inline in `POST /api/exchange` (3 not-ready retries, ~6s); a
  background job is deliberately not built while the app runs on one machine.
- Link notices are timestamped and expire only when a **manual** "Sync all" finishes
  fully clean; background syncs and partial successes deliberately never expire them.
- Re-link writes institution metadata only when a value was actually obtained.

## Home page (`/`)
- Institutions with logo, accounts table (balances, freshness stamp), Connect,
  Sync all, Remove (native `confirm()`), last-automatic-sync line.
- Logos served from a separate endpoint with `private, max-age=86400` — a stale
  logo up to a day after relink is accepted. Unknown image formats 404, not render.
- "Fix connection" appears **only** when the item error is Plaid-shaped: repair uses
  Plaid Link update mode (access token present, `products` omitted); success
  triggers the existing sync-all rather than a per-item endpoint. App-internal
  notices (skipped syncs, refresh failures) get no repair button by design.
- Remove deletes at Plaid first; `ITEM_NOT_FOUND` is idempotent success; an
  undecryptable token skips the revoke (logged) so removal is never wedged.
  Deletion runs under the per-item sync lock.
- Both pages poll every 60s only while visible, plus on tab return. Polling was
  chosen over push; a superseded poll writes nothing.
- The `unresolved` view state (loads failed, no previous list) deliberately renders
  nothing below the error line — the error notice is the surface at this stage.

## Account detail (`/accounts/[accountId]`)
- Header repeats the owning item's error (this is the page checked before spending).
- Transaction table: date/name/merchant/amount/currency/category select/reward
  rate/pending. Rate column header follows the card type (`Cashback %` vs
  `Multiplier`); rates carry no unit of their own.
- Category writes are optimistic with per-row burst coalescing (`CategoryWriteState`):
  at most one PATCH in flight per row, reconciliation on burst end, per-row error
  cells, rows under a burst held against poll clobbering (hold outlives the burst
  by one load, deliberately). Once set, a category can never be cleared — only
  replaced; PATCH rejects null.
- If the account or cards read failed, **both** pickers disable with a notice
  ("stale lists disable editing"); rows stay rendered. The server is the real guard.
- Unmatched account renders "Card not supported" telling the operator to edit
  `src/db/cards.seed.ts` and run `npm run seed:cards` — developer-directed
  remediation text is deliberate at this stage (the operator is the developer).
- Pager: 20/page, keeps stale rows on a failed/slow page turn, renders even for a
  single page, silent polls never disable it.

## Sync engine
- Hourly in-process scheduler plus one run ~10s after start; timers unref'd; no
  webhook (the app has no internet-reachable origin, and never will — no tunnels).
- `syncAllItems` is single-flight (manual sync joins a running pass); fan-out
  concurrency is 3, sized against pool max 10 at two connections per in-flight item.
  **Raising concurrency or shrinking the pool must revisit both together.**
- Per-item mutual exclusion via session-scoped Postgres advisory locks (dedicated
  client, released by session close, 60s bounded wait → `SYNC_LOCKED` 503; the lock
  session raises its own statement/query timeouts, deliberately). Cursor and token
  are re-read inside the lock. **Requires a direct session-mode Postgres
  connection** — transaction-pooling proxies silently break it.
- Sync-all itself deliberately has no cross-process guard (duplicate passes are
  safe, merely wasteful).
- Unknown-account rows: cursor held for up to 5 syncs ("held, N of 5"), then
  advanced and rows dropped for good. No mid-drain checkpointing (initial syncs
  pull days, not years).
- Accounts re-upserted every sync, each in its own transaction; a refresh failure
  reaches `items.error`; held/dropped messages win over it.
- Pending→posted carry moves category/rate/credit selections; carry works only when
  removal and replacement arrive in the same sync (accepted limitation). Existing
  rows keep their saved selections over a carried value.
- One retry on transient Plaid failures (no response, ≥500, or 429 honoring
  Retry-After capped 30s); any other 4xx propagates immediately. Full backoff
  deliberately deferred at single-user volumes.
- Not-ready polling budgets are cumulative per drain: 10 retries for sync-all,
  3 for exchange.
- Every network wait is bounded (Plaid 60s, drain 200 pages × 500 rows, client
  fetch 120s, PG statement 30s / query 35s, connection 10s; the advisory-lock
  75s override is the one exception). These are hang guards, not SLAs; an aborted
  client request does not cancel the server-side sync.
- Whole-run outcome is held in memory (`lastSync`) and served on `/api/items` —
  correct because the scheduler is in-process.
- `unhandledRejection`/`uncaughtException` → log-and-exit (not log-and-continue);
  `scripts/start.mjs` supervises: warm-up request (instrumentation is lazy under
  `next start`), restart on crash, hard stop after 3 exits in 60s. `npm run dev`
  deliberately has no supervisor. Pool `'error'` events are logged, not crashed.

## Cards & categories
- The catalog is code (`src/db/cards.seed.ts`) applied by `npm run seed:cards`;
  no UI/API writes it. Slug is identity. Reconcile **retires** (soft-delete)
  anything absent — nothing is ever deleted, FK set-nulls never fire. A retired
  card's own categories stay unstamped (unreachable anyway).
- Seed validation fails loudly: duplicate/blank slugs, names, claimed Plaid names;
  rates must be finite, > 0, ≤ 20 (typo tripwire — distinct from the deferred
  caps modeling); `ratesVerified { on, source }` is a required editorial
  attestation (real past date, non-blank source), deliberately not persisted.
- Account↔card matching: trim + lowercase + exact match on `plaidAccountNames`,
  re-run on **every** sync, overwriting `card_id` unconditionally. **There is
  deliberately no "keep existing card_id" branch — do not add one.** Unmatched is
  temporary: no writer may clear saved categories/rates because `card_id` is null.
  There is no card-move case. Card-name drift recovery is code-only (edit seed).
- Categorization is a historical snapshot: rate captured at pick time; seed rate
  edits affect future picks only; retired categories render by join as the
  disabled selected option. The one writer exception: a `modified` transaction
  whose amount flips sign clears the now-wrong-kind selection (DB constraint
  would reject it).
- Kind sign rule: positive amounts take card categories (with rate), negative take
  credit categories (global, rate-less); enforced by the
  `transactions_category_kind_sign_ck` CHECK and classified only via
  `kindForAmount`. Every per-kind branch is compiler-exhaustive
  (`assertNeverKind` / `satisfies Record<CategoryKind, …>`); the DB constraint is
  the one site a new kind must extend by hand via migration.

## API surface
- Typed contract: payloads declared once in `api-types.ts`, checked on both sides;
  clients read only `Serialized<Payload>` through the single response reader
  (`getJson`/`sendJson`; hand-parsing a response is a violation). Column omissions
  are derived from runtime picks, never restated `Omit`s. Access tokens and the
  raw Plaid payload are never served; new columns reach clients by default while
  those never do (deliberate destructure convention).
- Error envelope `{ error: { code, message } }` built only by `jsonError`/
  `badRequest`; `err.message` is never echoed (SQL/params ride drizzle messages) —
  only Plaid error bodies (runtime type-checked field by field) and app-written
  `PublicError`s pass. 55P03/40P01 → `LOCKED` 503 app-wide; 23503 → 409
  route-locally on the category PATCH. `proxy.ts` inlines the envelope
  deliberately (proxy code avoids shared modules).
- `GET /api/accounts/[accountId]` returns `{ account: null }` on a 200 for
  not-found — **deliberate**: the load protocol needs positive evidence of a
  successful-but-empty read, and the shared reader throws on error statuses.
- List endpoints are explicitly ordered; transactions order `desc(date), desc(id)`
  so pagination is a total order. `limit`/`offset` clamp silently; an **empty**
  `?accountId=` is a 400 (an empty variable must not fall through to unfiltered).
- Routes are thin; domain logic lives in `src/lib` behind named functions throwing
  `PublicError`. Pages are client components fetching `/api/*` (a server-side DB
  read in a page is not the pattern); page-local hooks live beside their pages.

## Security posture
- Loopback-only: the `-H 127.0.0.1` bind (appended last by `start.mjs`, so
  unoverridable) is the enforcement; `proxy.ts` is defense-in-depth — bodyless 404
  for non-local requests on every path, Host structure rejected before URL parsing,
  same-origin check on state-changing requests with an Origin (Origin-less curl
  passes, deliberately). A bare `next dev`/`next start` binds every interface with
  nothing to catch it — accepted. Dev mode's `/__nextjs_*` endpoints are
  structurally unfixable; mitigation is that **production mode is the everyday
  mode** and dev sessions are short, attended work.
- Per-request nonce CSP with `strict-dynamic` (plus `cdn.plaid.com`); `style-src`
  keeps `'unsafe-inline'` deliberately; every page renders dynamically (root
  layout awaits `connection()`) — no static optimization, irrelevant here.
- Plaid access tokens AES-256-GCM (`iv:tag:ciphertext`), encrypted exactly once
  per link; rotation via `ENCRYPTION_KEY_PREVIOUS` + `npm run rotate:key`
  (conditional updates never clobber a concurrent relink). **Financial data is
  plaintext at rest, deliberately** — device compromise is the threat, full-disk
  encryption the answer; encrypting amounts would break SQL over them.
- Every caught-error log site goes through `logError`, which redacts axios errors
  unconditionally (they carry `PLAID-SECRET` and decrypted tokens in config);
  non-axios errors pass through (drizzle detail in server logs is acceptable).
- `.next` is chmod-tightened to 0700 by `tighten-next.mjs` from four call sites,
  fail-closed (Turbopack persists env secrets into world-readable cache files);
  files written during a live dev session stay 0644 until the next tighten —
  accepted. On win32 it skips with a note, deliberately not fail-open.
- 128kb proxy body cap; X-Frame-Options DENY, nosniff, no-referrer static headers.

## Accessibility & formatting
- Live-region rule for async UI: errors render conditionally with `role="alert"`;
  status text lives inside always-mounted `role="status"` wrappers whose content
  toggles ("wrapper must stay mounted"). New async UI must follow this.
- Money renders via one `Intl.NumberFormat` formatter using the row's own currency
  code (falling back to grouped decimals + appended code for non-ISO codes);
  `'—'` for null so missing never reads as zero; unparseable numerics render
  verbatim. This is data correctness, not styling.

# Architecture

- Next.js 16.3.4 (this version differs from training data — read
  `node_modules/next/dist/docs/` before writing Next-facing code), React 19.2.8,
  TypeScript strict + `noUncheckedIndexedAccess`, drizzle-orm/pg, Plaid SDK
  pinned to `Plaid-Version: 2020-09-14`, Node 24.x, Postgres ≥ 11 (floor asserted
  at startup; retained deliberately even though its original motivator is gone).
- The Plaid SDK is imported by exactly one file (`src/lib/plaid.ts`), which adapts
  everything to app-owned `Provider*` shapes at ingest. This is a thin seam, not a
  multi-provider abstraction — no second provider is planned. `plaid.ts` stays one
  module deliberately; the split trigger is ESLint `max-lines` 400.
- Client/server boundary: `db.ts`, `plaid.ts`, `crypto.ts` import `server-only`
  (build-time poison); a genuinely new server root must add its own. Small shared
  types live in dependency-free modules bundled client-side. Coordination state
  (pool, scheduler flag, single-flight slot) lives on `globalThis` via
  `globalSingleton` because the bundler emits per-graph module copies; the pool
  error listener attaches inside the factory for the same reason.
- Sync pipeline is split by stage: `sync.ts` (orchestration/lock), `sync-carry`,
  `sync-persist` (500-row chunked upserts against the bind-param cap),
  `sync-outcome`, `sync-lock`, `sync-status`, `sync-all`, `sync-scheduler`,
  `sync-messages` (single home for user-facing sync wording).
- `src/proxy.ts` (Next 16's middleware) deliberately has no matcher — the guard
  covers every path and the nonce must reach every document.
- Lint: type-aware `no-floating-promises`/`no-misused-promises` as errors,
  `react-hooks/exhaustive-deps` as error, `max-lines` 400, unused vars as error.
  `useLoadProtocol`'s memoized-`perform` contract is documented, not enforced —
  the one contract lint can't reach.
- Migrations only (`db:generate` + `db:migrate`; `push` is forbidden — 0003
  carries hand-written data statements) and append-only once committed (the old
  comment-only edit to 0003 stands as-is; reverting would be another edit).
- Comment policy: near-zero comments, default zero on new code. Allowed: a
  `Verified-on: <package>@<version>` marker with its one-line claim for
  hand-verified third-party behavior, or a rare one-line local constraint the
  code cannot show. No orientation prose, rationale, doc URLs, or cross-module
  claims. (The old `Design:` markers and the Verified-on lint checker are gone;
  the convention itself stands, unenforced.)
- Config is validated, never assumed (`PLAID_ENV` against SDK enums,
  `ENCRYPTION_KEY` 64-hex, `DATABASE_URL` scheme — `postgres://` alias passes,
  products/country codes against enums); messages name the variable, never the
  value; misconfiguration stops the server (Next doesn't treat a rejected
  `register()` as fatal, so instrumentation exits explicitly).

# Data model

- `cards` (code-seeded catalog; slug identity; `plaidAccountNames` is the matching
  key; `retiredAt` soft delete) → `card_categories` (per-card reward tiers,
  rate, retirable) ; `credit_categories` (one global rate-less list, retirable).
- `items` (one linked institution: encrypted `accessToken`, cursor, typed `error`
  jsonb, `skippedSyncs`, institution metadata incl. logo and `primaryColor` —
  metadata columns are deliberately kept even where not yet rendered).
- `accounts` (FK item cascade, FK card set-null, balances, both ISO and
  unofficial currency codes).
- `transactions` (unique Plaid id; category FKs set-null; `rewardRate` snapshot;
  `category` = Plaid PFC primary, stored and served but not yet rendered;
  `plaidTransaction` raw payload stored, never served; CHECK constraint
  `transactions_category_kind_sign_ck` binding category kind to amount sign;
  index `(account_id, date DESC)`).
- Nine migrations, 0000–0008; 0008 adds `unofficial_currency_code`.

# Intentionally absent / deferred

Auditors must never flag anything in this section. Revisit triggers cluster
around four events: a second (or non-developer) user, a second card in the
catalog, a remote/hosted database or backups leaving the machine, and more than
one server process by design.

- **Tests** — deliberately deferred project-wide (2026-09-06). Covers the untested
  `start.mjs` supervisor. When tests land, `start.mjs` is a priority target.
- **Single-card catalog** — one card (Amex Blue Cash Preferred) on purpose; more
  land once the single-card experience is settled. Not an incomplete catalog.
- **Reward aggregation / optimization surface** — nothing multiplies or compares
  `rewardRate` and `amount` anywhere; only the data-collection half of the app's
  premise is built. The per-transaction snapshot is what makes the deferred
  computation possible later. Do not flag the forward-looking app description.
  Revisit: single-card flow validated, or a second card.
- **Reward caps/tiers** — `rate` is flat; past the real card's annual cap the
  displayed rate is knowingly "the headline rate". A cap field without cumulative
  aggregation would be false precision. Revisit with aggregation.
- **Plaid category rendered** — stored and served, no UI shows it; reserved for a
  planned auto-categorization feature. Not dead weight.
- **Data export** — no CSV/JSON path; the operator has `pg_dump`. Revisit:
  history worth protecting, a second user, or a Postgres migration.
- **Authentication** — every `/api` route is open, deliberately (single user,
  loopback-only). Flag only if the app is being deployed.
- **Deployment boundaries** (accepted with triggers): no user/tenant scoping in
  any table; unprefixed tables assuming a dedicated database; single-process
  in-memory coordination (scheduler flag, single-flight, lastSync); offset
  pagination and unconditional 60s polling with no change detection; card-name
  drift recovery is code-only.
- **Styling** — no CSS, no component library; `confirm()` for confirmation;
  errors inline. Not an audit finding. (Money/live-region rules are correctness,
  not styling, and do apply.)
- **Webhooks / tunnels** — no internet-reachable origin, ever. In-process timer
  replaced the webhook design; forwarded-header checks remain defense-in-depth.
- **Backoff policy** — one bounded retry is the policy; exponential backoff
  deferred at single-user volumes.
- **Mid-drain checkpointing** — a failed drain restarts from the same cursor;
  accepted while initial syncs pull days, not years.
- **Background job for the inline first sync** — deferred while the app runs on
  one machine.
- **Dev-dependency advisory** — `npm audit`'s 4 moderate findings are one chain
  (`drizzle-kit → @esbuild-kit → esbuild`, GHSA-67mh-4wv8-2f99), dev-only,
  unreachable at runtime, `--omit=dev` clean; the only fix is a breaking
  downgrade. Do not re-raise while these facts hold. Revisit: drizzle-kit
  dropping `@esbuild-kit`.
- **Plaid SDK deprecated fields** — `Transaction.name` (always populated, the
  display description) and `category` (fallback behind `personal_finance_category`)
  are used deliberately; editor strikethroughs are expected noise.
