This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

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

## Before deploying

SpendRight is currently a single-user tool run on localhost, and two things are
left undone on purpose because of that. Both have to be settled before it is
reachable from anywhere else. The full note, with the reasoning, is at the top
of `src/app/api/exchange/route.ts`.

- **No authentication on any route.** Everything under `/api` is open, including
  the route that mints and stores a Plaid access token, the route that deletes an
  institution and all of its data, and the reads that return the account's whole
  transaction history. The `items` table holds encrypted bank credentials.
- **`POST /api/exchange` can run long.** It makes several Plaid calls before it
  answers and the last one paginates, so a first sync of an item with years of
  history can exceed a host's request timeout (Vercel's hobby limit is 10s) and
  fail a link that actually succeeded. The in-request retry sleeping is capped
  but not gone (the initial sync polls at most 3 times, ~6s); finishing the job
  means running the first sync as a background job the client polls.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
