import { desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { cardCategories, creditCategories, transactions } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const accountId = req.nextUrl.searchParams.get('accountId');
    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'accountId is required' } },
        { status: 400 },
      );
    }

    // Both bounds are CLAMPED for range and truncated for type — neither is
    // ever rejected, so a bad value gets a sane page rather than a 400. Only
    // the upper end used to be enforced at all, and the two bounds failed
    // differently:
    //
    //   ?limit=-1   did NOT error. drizzle emits the clause only for a
    //               non-negative number (`limit >= 0`, pg-core/dialect.cjs),
    //               so a negative limit dropped LIMIT from the query altogether
    //               and returned every transaction on the account — an
    //               unbounded scan, with a 200 and no complaint.
    //   ?offset=-1  did error. That test is plain truthiness, so -1 reached
    //               Postgres as `OFFSET -1` and the statement was refused.
    //
    // Type matters as much as range, because drizzle binds both as query
    // parameters (`limit $1 offset $2`) that Postgres reads as bigint: any
    // non-integer or out-of-bigint-range value is `invalid input syntax for
    // type bigint`. `?limit=1.5` sends "1.5" and `?offset=1e21` sends "1e+21".
    // Since errorResponse stopped echoing err.message, each of those reaches
    // the client as a bare "Internal server error" for a plainly bad request.
    const readBound = (name: string, fallback: number, min: number, max: number) => {
      // Truncated BEFORE the zero test so a single rule covers the whole
      // interval: absent, "", "abc", 0 and any fraction that truncates to 0 all
      // mean "unspecified" and take the fallback. Testing zero first split
      // them — `?limit=0` took the default while `?limit=0.5` returned 1 row.
      //
      // NaN is the only value that cannot be clamped onto the interval, so it
      // is the only one sent to the fallback from here — and only a
      // non-numeric string reaches it, since absent and "" both Number() to 0
      // and are caught by the zero test. ±Infinity IS clamped, deliberately:
      // it is what an exponent too large for a double parses to, and testing
      // `Number.isFinite` here instead made `?offset=1e400` answer with the
      // FIRST page, while `?offset=1e21` — the same intent, but small enough to
      // stay finite, since a double overflows to Infinity above about 1e308 —
      // clamped to the cap and correctly returned nothing. Math.trunc
      // passes ±Infinity through unchanged, so Math.max/Math.min land it on
      // min/max.
      const parsed = Math.trunc(Number(req.nextUrl.searchParams.get(name)));
      if (Number.isNaN(parsed) || parsed === 0) return fallback;
      return Math.min(Math.max(parsed, min), max);
    };
    // The limit floor is 1 because 0 is already spoken for above: a caller
    // asking for `?limit=0` gets the default page, not an empty one.
    //
    // The default stays at 500 even though the account page now asks for 20 at
    // a time (its PAGE_SIZE): the page size is the CLIENT's decision, and a
    // caller that names no limit — curl, a script — is better served by one
    // large response than by silently getting 20 rows.
    const limit = readBound('limit', 500, 1, 1000);
    // MAX_SAFE_INTEGER, not Infinity: it is the largest integer that survives
    // Number -> string -> bigint intact, and it is well inside bigint range.
    const offset = readBound('offset', 0, 0, Number.MAX_SAFE_INTEGER);

    // Every column EXCEPT the raw Plaid payload. plaid_transaction is the
    // whole transactions/sync object kept for debugging (src/db/schema.ts) and
    // is by far the widest column — one to two kilobytes of JSON per row — so
    // a default page of 500 shipped close to a megabyte that the only consumer
    // never looks at: the `Transaction` interface in
    // src/app/accounts/[accountId]/page.tsx does not declare the field, and no
    // client reads it. Excluded rather than listing the columns to keep, so a
    // column added to the schema still reaches the client without a change
    // here.
    const { plaidTransaction: _plaidTransaction, ...transactionColumns } =
      getTableColumns(transactions);

    const rows = await db
      .select({
        ...transactionColumns,
        cardCategoryName: cardCategories.name,
        creditCategoryName: creditCategories.name,
      })
      .from(transactions)
      .leftJoin(cardCategories, eq(transactions.cardCategoryId, cardCategories.id))
      .leftJoin(creditCategories, eq(transactions.creditCategoryId, creditCategories.id))
      .where(eq(transactions.accountId, accountId))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit)
      .offset(offset);

    // How many rows the account has in total, not how many this page holds.
    // Without it a client cannot tell a full last page from a page with more
    // behind it, and the account page's pager would have to guess at "Next" —
    // which is how the old unpaginated version silently showed only the newest
    // 500 of a longer history with nothing on screen saying so.
    //
    // A second query rather than a window function over the page: `count(*)
    // over ()` returns nothing at all on an empty page, so an offset past the
    // end would report a total of 0 and the clamp on the client would have no
    // way home.
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.accountId, accountId));

    return NextResponse.json({ transactions: rows, total, limit, offset });
  } catch (err) {
    return errorResponse(err);
  }
}
