import { type NextRequest, NextResponse } from 'next/server';
import type { ExchangeResponse } from '@/lib/api-types';
import { badRequest, readJsonBody, withErrorResponse } from '@/lib/errors';
import { linkItem } from '@/lib/link';

// Unauthenticated and long-running (several Plaid calls plus the first sync
// inline). Design: single-user-localhost-no-auth, inline-initial-sync.
export const POST = withErrorResponse(async (req: NextRequest) => {
  const body = await readJsonBody(req);
  const publicToken = (body as { public_token?: unknown } | null)?.public_token;
  if (typeof publicToken !== 'string' || !publicToken) {
    return badRequest('public_token is required');
  }

  const result = await linkItem(publicToken);
  return NextResponse.json<ExchangeResponse>({
    item_id: result.itemId,
    institution_name: result.institutionName,
    accounts: result.accountsStored,
    transactions: result.sync,
    sync_error: result.syncError,
    account_errors: result.accountErrors.length > 0 ? result.accountErrors : null,
  });
});
