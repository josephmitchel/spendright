import { type NextRequest, NextResponse } from 'next/server';
import type { TransactionsPayload } from '@/lib/api-types';
import { badRequest, withErrorResponse } from '@/lib/errors';
import { MAX_PAGE_LIMIT, PAGE_SIZE, readBound } from '@/lib/pagination';
import { listTransactions } from '@/lib/transactions';

export const GET = withErrorResponse(async (req: NextRequest) => {
  const accountId = req.nextUrl.searchParams.get('accountId')?.trim();
  if (!accountId) {
    return badRequest('accountId is required');
  }

  const limit = readBound(req.nextUrl.searchParams.get('limit'), PAGE_SIZE, 1, MAX_PAGE_LIMIT);
  const offset = readBound(req.nextUrl.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

  const { transactions, total } = await listTransactions(accountId, limit, offset);
  return NextResponse.json<TransactionsPayload>({ transactions, total });
});
