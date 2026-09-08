import { type NextRequest, NextResponse } from 'next/server';
import type { ExchangeResponse } from '@/lib/api-types';
import { badRequest, withErrorResponse } from '@/lib/errors';
import { linkItem } from '@/lib/link';
import { readJsonBody } from '@/lib/request-body';

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
    accounts_stored: result.accountsStored,
    sync: result.sync,
    sync_error: result.syncError,
    setup_failed: result.setupFailed,
    account_errors: result.accountErrors.length > 0 ? result.accountErrors : null,
  });
});
