import { NextResponse } from 'next/server';
import type { SyncResponse } from '@/lib/api-types';
import { withErrorResponse } from '@/lib/errors';
import { syncAllItems } from '@/lib/sync-all';

// The manual "Sync all" path; shares the single-flight runner with the
// scheduler. Design: scheduled-sync, automatic-sync.
export const POST = withErrorResponse(async () => {
  const results = await syncAllItems();
  return NextResponse.json<SyncResponse>({ results });
});
