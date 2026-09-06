import { NextRequest, NextResponse } from 'next/server';
import type { TransactionPatchPayload } from '@/lib/api-types';
import { setTransactionCategory, type CategoryKind } from '@/lib/categories';
import { badRequest, errorResponse, jsonError, pgErrorCode } from '@/lib/errors';

// Postgres serial ids are int32; anything past that cannot exist.
const MAX_INT32 = 2147483647;

function isValidId(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= MAX_INT32;
}

// The body's exactly-one-key contract; a string result is the rejection
// message. Design: category-write-contract, no-category-clear.
function parseCategoryPatch(body: unknown): { kind: CategoryKind; categoryId: number } | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }
  const record = body as Record<string, unknown>;
  const hasCardKey = 'cardCategoryId' in record;
  const hasCreditKey = 'creditCategoryId' in record;
  if (hasCardKey === hasCreditKey) {
    return 'Provide exactly one of cardCategoryId or creditCategoryId';
  }
  const key = hasCardKey ? 'cardCategoryId' : 'creditCategoryId';
  const raw = record[key];
  if (!isValidId(raw)) {
    return `${key} must be a positive integer`;
  }
  return { kind: hasCardKey ? 'card' : 'credit', categoryId: raw };
}

// Set a transaction's category. Exactly one key must be present:
// - { cardCategoryId: number }   spend category (amount >= 0)
// - { creditCategoryId: number } inflow category (amount < 0)
// There is no clear. Design: category-write-contract, no-category-clear.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest('Request body must be valid JSON');
    }
    const parsed = parseCategoryPatch(body);
    if (typeof parsed === 'string') {
      return badRequest(parsed);
    }

    const transaction = await setTransactionCategory(transactionId, parsed.kind, parsed.categoryId);
    return NextResponse.json<TransactionPatchPayload>({ transaction });
  } catch (err) {
    // 23503 foreign_key_violation: the category was deleted (by hand; the seed
    // only retires) between validation and the update. Route-local because the
    // meaning of a broken FK is this route's alone; PublicError rejections and
    // the app-wide lock/deadlock mapping live in errorResponse.
    if (pgErrorCode(err) === '23503') {
      return jsonError(
        'CATEGORY_REMOVED',
        'That category no longer exists — reload the page and pick again',
        409,
      );
    }
    return errorResponse(err);
  }
}
