import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { accounts } from '@/db/schema';
import type { AccountsPayload } from '@/lib/api-types';
import { db } from '@/lib/db';
import { badRequest, withErrorResponse } from '@/lib/errors';

export const GET = withErrorResponse(async (req: NextRequest) => {
  // Trimmed before filtering so a padded id can never pass validation and
  // then silently match nothing. Absent means unfiltered; present-but-blank
  // is a caller bug and is rejected regardless of which filter wins.
  // Design: query-bounds-clamped.
  const itemId = req.nextUrl.searchParams.get('itemId')?.trim() ?? null;
  const accountId = req.nextUrl.searchParams.get('accountId')?.trim() ?? null;
  if (accountId === '') return badRequest('accountId must not be empty');
  if (itemId === '') return badRequest('itemId must not be empty');
  // With both filters present, accountId (the narrower one) wins and itemId
  // is ignored; no caller sends both.
  const filter = accountId
    ? eq(accounts.accountId, accountId)
    : itemId
      ? eq(accounts.itemId, itemId)
      : undefined;
  const rows = await db.select().from(accounts).where(filter);
  return NextResponse.json<AccountsPayload>({ accounts: rows });
});
