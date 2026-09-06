import { NextRequest, NextResponse } from 'next/server';
import type { TransactionsPayload } from '@/lib/api-types';
import { badRequest, errorResponse } from '@/lib/errors';
import { listTransactions } from '@/lib/transactions';

// Bounds are truncated to integers and clamped, never rejected. Absent,
// non-numeric and zero all take the fallback; ±Infinity clamps to the edge.
// Design: query-bounds-clamped.
function readBound(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(raw));
  if (Number.isNaN(parsed) || parsed === 0) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(req: NextRequest) {
  try {
    // Trimmed before filtering so a padded id can never pass validation and
    // then silently match nothing.
    const accountId = req.nextUrl.searchParams.get('accountId')?.trim();
    if (!accountId) {
      return badRequest('accountId is required');
    }

    const limit = readBound(req.nextUrl.searchParams.get('limit'), 500, 1, 1000);
    // MAX_SAFE_INTEGER: the largest integer that survives the bigint bind intact.
    const offset = readBound(req.nextUrl.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

    const { transactions, total } = await listTransactions(accountId, limit, offset);
    return NextResponse.json<TransactionsPayload>({ transactions, total, limit, offset });
  } catch (err) {
    return errorResponse(err);
  }
}
