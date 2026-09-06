# SpendRight

A single-user personal finance app centered on credit card spending
optimization: it links bank accounts through Plaid, syncs credit card
transactions, and tracks which reward category each purchase earned.

## Getting Started

Run the production server — this is the everyday mode:

```bash
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

`npm run dev` is for short-lived, attended development work only: the dev
bundler's own `/__nextjs_*` endpoints sit ahead of the request guard and are
reachable from a hostile web page via DNS rebinding, while `next start` does
not mount them (details under "Automatic sync" below).

## Database

Schema lives in `src/db/schema.ts`; migrations are the source of truth for
applying it:

```bash
npm run db:generate   # after editing the schema, writes drizzle/NNNN_*.sql
npm run db:migrate    # applies pending migrations
npm run seed:cards    # upserts the card catalog in src/db/cards.seed.ts
```

Do not use `drizzle-kit push`. Migrations carry hand-written data statements
(0003 backfills wrong-kind category state before adding the sign constraint),
and push applies only the schema diff — skipping those, which makes the
constraint fail to apply on any database with legacy rows.

### First run on a database that predates this

There was no `db:migrate` script before these migrations, so a database built
with `push` has no `__drizzle_migrations` ledger and `db:migrate` starts from
`0000`, failing with `relation "accounts" already exists` (`0000` creates
`accounts`, `items` and `transactions`; `cards` does not appear until `0001`).
That error is loud, but what it costs is quiet: `0003` — the one migration that
_must_ run this way — never applies, and the sign constraint is silently absent
while the app assumes it is there. Check which case you are in:

```sql
select id, hash, created_at from drizzle.__drizzle_migrations order by created_at;
```

There is no `tag` column: drizzle creates this table as `id` / `hash` /
`created_at` and nothing else. `created_at` is epoch milliseconds, matching the
`when` field of the corresponding entry in `drizzle/meta/_journal.json` — that
is what identifies a row, since the filename is not recorded anywhere.

Either drop the database and run `npm run db:migrate` from empty (simplest in
development), or baseline the existing one by creating the ledger and recording
what `push` already built as applied.

Baselining has one trap, and it is worth stating outright because getting it
wrong reproduces the exact silent failure this section exists to prevent. The
migrator reads only the single newest ledger row, and runs a migration when
that row's `created_at` is less than the migration's `when` — it never compares
hashes or filenames. So the row you insert must carry the `when` of the last
migration you are baselining, copied verbatim from `_journal.json`. Inserting a
current timestamp instead silently marks _everything_ as applied: these
migrations were generated within the last few days, so `now()` is greater than
every one of them, and `0002` onward are skipped without running and without an
error. To baseline `0000` and `0001` — using `0001_same_bruce_banner`'s `when`,
so `0002` onward still run:

```sql
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
insert into drizzle.__drizzle_migrations (hash, created_at)
values ('baseline-0001_same_bruce_banner', 1788309102608);
```

`hash` is written by the migrator but never read back by it, so any marker that
tells the next reader where the row came from will do.

## Automatic sync

Syncing is automatic: an in-process scheduler (`src/lib/sync-scheduler.ts`,
started once per server from `src/instrumentation.ts`) syncs every linked item
shortly after the server starts and then hourly. The "Sync all" button remains
for impatience; it shares a single-flight runner with the scheduler
(`src/lib/sync-all.ts`), so a press during a scheduled run joins that run
rather than racing it. Per-item failures are logged and recorded on the item,
where the UI surfaces them.

Nothing about syncing is internet-reachable. The previous design — Plaid
transaction webhooks delivered through a tunnel to `POST /api/webhook` — was
retired 2026-09-05: a security audit found that `next dev`'s internal
`/__nextjs_*` endpoints bypassed the request guard entirely, so the tunnel
exposed more than the one verified route. With the scheduler there is no
exposed origin at all: every route answers loopback callers only. Do not put
a tunnel or any other forwarder in front of this app.

For everyday use, run the production server (`npm run build && npm run
start`), not `next dev`: the dev bundler's own `/__nextjs_*` endpoints sit
ahead of the request guard, and a hostile page can reach them through the
local browser via DNS rebinding — no tunnel required. `next start` does not
mount them. Treat dev sessions as short-lived, attended work.

## Before deploying

SpendRight is currently a single-user tool run on localhost, and two things are
left undone on purpose because of that. Both have to be settled before it is
reachable from anywhere else.

- **No authentication on any route.** Everything under `/api` is open, including
  the route that mints and stores a Plaid access token, the route that deletes an
  institution and all of its data, and the reads that return the account's whole
  transaction history. The `items` table holds encrypted bank credentials.
  (The loopback bind keeps the LAN out and `src/proxy.ts` refuses any
  non-loopback request — but that is a guard, not authentication.)
- **`POST /api/exchange` can run long.** It makes several Plaid calls before it
  answers and runs the first sync inline. That sync pulls a few days of history
  at most, so volume is not the concern — the in-request retry sleeping is: the
  initial sync polls Plaid's not-ready state at most 3 times (~6s), which on a
  host with a tight request timeout (Vercel's hobby limit is 10s) can fail a
  link that actually succeeded. Finishing the job means running the first sync
  as a background job the client polls.
