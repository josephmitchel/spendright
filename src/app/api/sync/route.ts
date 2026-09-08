import { NextResponse } from 'next/server';
import type { SyncResponse } from '@/lib/api-types';
import { withErrorResponse } from '@/lib/errors';
import { syncAllItems } from '@/lib/sync-all';

// Design: scheduled-sync.
export const POST = withErrorResponse(async () => {
  const results = await syncAllItems();
  return NextResponse.json<SyncResponse>({ results });
});
