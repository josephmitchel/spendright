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
    itemId: result.itemId,
    institutionName: result.institutionName,
    accountsStored: result.accountsStored,
    sync: result.sync,
    syncError: result.syncError,
    setupFailed: result.setupFailed,
    accountErrors: result.accountErrors.length > 0 ? result.accountErrors : null,
  });
});
