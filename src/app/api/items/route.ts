import { NextResponse } from 'next/server';
import type { ItemsPayload } from '@/lib/api-types';
import { withErrorResponse } from '@/lib/errors';
import { listPublicItems } from '@/lib/items';
import { lastSyncStatus } from '@/lib/sync-status';

export const GET = withErrorResponse(async () => {
  return NextResponse.json<ItemsPayload>({
    items: await listPublicItems(),
    lastSync: lastSyncStatus(),
  });
});
