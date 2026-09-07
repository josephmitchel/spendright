import { NextResponse } from 'next/server';
import { accounts } from '@/db/schema';
import type { AccountsPayload } from '@/lib/api-types';
import { db } from '@/lib/db';
import { withErrorResponse } from '@/lib/errors';

// Design: account-fetched-by-id.
export const GET = withErrorResponse(async () => {
  // Ordered by id (creation order) so rows don't reshuffle under the poll.
  // Design: list-endpoints-ordered.
  const rows = await db.select().from(accounts).orderBy(accounts.id);
  return NextResponse.json<AccountsPayload>({ accounts: rows });
});
