import { type NextRequest, NextResponse } from 'next/server';
import type { TransactionsPayload } from '@/lib/api-types';
import { badRequest, withErrorResponse } from '@/lib/errors';
import { MAX_PAGE_LIMIT, PAGE_SIZE } from '@/lib/pagination';
import { listTransactions } from '@/lib/transactions';

// Design: transactions-paginated.
function readBound(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(raw));
  if (Number.isNaN(parsed) || parsed === 0) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

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
