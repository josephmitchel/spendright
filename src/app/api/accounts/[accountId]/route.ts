import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { accounts, items } from '@/db/schema';
import { servedAccountColumns } from '@/lib/accounts';
import type { AccountPayload } from '@/lib/api-types';
import { db } from '@/lib/db';
import { withErrorResponse } from '@/lib/errors';

export const GET = withErrorResponse(
  async (_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) => {
    const { accountId } = await params;
    const [account] = await db
      .select(servedAccountColumns)
      .from(accounts)
      .where(eq(accounts.accountId, accountId));
    // The owning item's error is the staleness warning for these balances.
    let itemError: AccountPayload['itemError'] = null;
    if (account) {
      const [item] = await db
        .select({ error: items.error })
        .from(items)
        .where(eq(items.itemId, account.itemId));
      itemError = item?.error ?? null;
    }
    return NextResponse.json<AccountPayload>({ account: account ?? null, itemError });
  },
);
