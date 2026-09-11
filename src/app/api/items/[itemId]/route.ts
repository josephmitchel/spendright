import { type NextRequest, NextResponse } from 'next/server';
import type { ItemDeleteResponse } from '@/lib/api-types';
import { jsonError, withErrorResponse } from '@/lib/errors';
import { removeItemCompletely } from '@/lib/items';

export const DELETE = withErrorResponse(
  async (_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) => {
    const { itemId } = await params;
    if (!(await removeItemCompletely(itemId))) {
      return jsonError('NOT_FOUND', 'Item not found', 404);
    }
    return NextResponse.json<ItemDeleteResponse>({ deleted: itemId });
  },
);
