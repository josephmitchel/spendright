import { NextResponse } from 'next/server';
import type { SyncResponse } from '@/lib/api-types';
import { errorResponse } from '@/lib/errors';
import { syncAllItems } from '@/lib/sync-all';

// The manual "Sync all" path. It shares the single-flight runner with the
// scheduler, so a press mid-scheduled-run joins that run rather than racing
// it. Design: scheduled-sync, automatic-sync.
export async function POST() {
  try {
    const results = await syncAllItems();
    return NextResponse.json<SyncResponse>({ results });
  } catch (err) {
    return errorResponse(err);
  }
}
