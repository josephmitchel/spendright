import { type NextRequest, NextResponse } from 'next/server';
import type { TransactionPatchPayload } from '@/lib/api-types';
import { setTransactionCategory } from '@/lib/categories';
import { parseCategoryPatch } from '@/lib/category-patch-parse';
import { badRequest, withErrorResponse } from '@/lib/errors';
import { readJsonBody } from '@/lib/request-body';

export const PATCH = withErrorResponse(
  async (req: NextRequest, { params }: { params: Promise<{ transactionId: string }> }) => {
    const { transactionId } = await params;
    const parsed = parseCategoryPatch(await readJsonBody(req));
    if (!parsed.ok) {
      return badRequest(parsed.message);
    }

    const transaction = await setTransactionCategory(transactionId, parsed.kind, parsed.categoryId);
    return NextResponse.json<TransactionPatchPayload>({ transaction });
  },
);
