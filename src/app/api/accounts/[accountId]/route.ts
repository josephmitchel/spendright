import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { accounts } from '@/db/schema';
import type { AccountPayload } from '@/lib/api-types';
import { db } from '@/lib/db';
import { withErrorResponse } from '@/lib/errors';

// One account by id. `account` is null when no row matches — a 200, not a
// 404: the client's not-found rendering needs positive evidence the read
// succeeded. Design: partial-load-rendering, account-fetched-by-id.
export const GET = withErrorResponse(
  async (_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) => {
    const { accountId } = await params;
    const [account] = await db.select().from(accounts).where(eq(accounts.accountId, accountId));
    return NextResponse.json<AccountPayload>({ account: account ?? null });
  },
);
