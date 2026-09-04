import { desc, eq, getTableColumns } from 'drizzle-orm';
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
    const limit = readBound('limit', 500, 1, 1000);
    // MAX_SAFE_INTEGER, not Infinity: it is the largest integer that survives
    // Number -> string -> bigint intact, and it is well inside bigint range.
    const offset = readBound('offset', 0, 0, Number.MAX_SAFE_INTEGER);

    const rows = await db
      .select({
        ...getTableColumns(transactions),
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

    return NextResponse.json({ transactions: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
