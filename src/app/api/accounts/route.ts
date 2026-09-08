import { NextResponse } from 'next/server';
import { accounts } from '@/db/schema';
import { servedAccountColumns } from '@/lib/accounts';
import type { AccountsPayload } from '@/lib/api-types';
import { db } from '@/lib/db';
import { withErrorResponse } from '@/lib/errors';

export const GET = withErrorResponse(async () => {
  const rows = await db.select(servedAccountColumns).from(accounts).orderBy(accounts.id);
  return NextResponse.json<AccountsPayload>({ accounts: rows });
});
