import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { accounts } from '@/db/schema';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/errors';

function badRequest(message: string) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status: 400 });
}

export async function GET(req: NextRequest) {
  try {
    const itemId = req.nextUrl.searchParams.get('itemId');
    const accountId = req.nextUrl.searchParams.get('accountId');
    // An absent filter means "list every account" — the home page depends on
    // that. A filter that is present but empty means the caller built the URL
    // from an empty variable, which is a different thing entirely: letting it
    // fall through to the unfiltered select would answer `?accountId=` with
    // the whole table, and a caller reading accounts[0] would show an
    // unrelated account as though it were the one it asked for.
    //
    // Both are checked unconditionally, before the precedence in `filter`
    // below is applied, so `?accountId=abc&itemId=` is a 400 even though
    // itemId would never have been read. Deliberate: an empty value in a URL
    // means the caller built it from an empty variable, and that is a caller
    // bug worth reporting whether or not this particular request happened to
    // consult it. Making the guard depend on which parameter wins would trade
    // that for a rule that changes as the precedence does.
    if (accountId !== null && accountId.trim() === '') {
      return badRequest('accountId must not be empty');
    }
    if (itemId !== null && itemId.trim() === '') {
      return badRequest('itemId must not be empty');
    }
    const filter = accountId
      ? eq(accounts.accountId, accountId)
      : itemId
        ? eq(accounts.itemId, itemId)
        : undefined;
    const rows = await db.select().from(accounts).where(filter);
    return NextResponse.json({ accounts: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
