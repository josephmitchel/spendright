import { type NextRequest, NextResponse } from 'next/server';
import type { TransactionPatchPayload } from '@/lib/api-types';
import { setTransactionCategory } from '@/lib/categories';
import { categoryKindKeys, type CategoryKind } from '@/lib/category-kinds';
import { badRequest, jsonError, pgErrorCode, readJsonBody, withErrorResponse } from '@/lib/errors';

// Postgres serial ids are int32; anything past that cannot exist.
const MAX_INT32 = 2147483647;

function isValidId(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= MAX_INT32;
}

// The body's exactly-one-key contract. Design: category-write-contract,
// no-category-clear.
type ParsedCategoryPatch =
  { ok: true; kind: CategoryKind; categoryId: number } | { ok: false; message: string };

function parseCategoryPatch(body: unknown): ParsedCategoryPatch {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;
  // Wire keys come from the kind→key mapping in src/lib/category-kinds.ts.
  const hasCardKey = categoryKindKeys.card.id in record;
  const hasCreditKey = categoryKindKeys.credit.id in record;
  if (hasCardKey === hasCreditKey) {
    return {
      ok: false,
      message: `Provide exactly one of ${categoryKindKeys.card.id} or ${categoryKindKeys.credit.id}`,
    };
  }
  const key = hasCardKey ? categoryKindKeys.card.id : categoryKindKeys.credit.id;
  const raw = record[key];
  if (!isValidId(raw)) {
    return { ok: false, message: `${key} must be a positive integer` };
  }
  return { ok: true, kind: hasCardKey ? 'card' : 'credit', categoryId: raw };
}

// Set a transaction's category. Exactly one key must be present:
// - { cardCategoryId: number }   spend category (amount >= 0)
// - { creditCategoryId: number } inflow category (amount < 0)
// There is no clear. Design: category-write-contract, no-category-clear.
export const PATCH = withErrorResponse(
  async (req: NextRequest, { params }: { params: Promise<{ transactionId: string }> }) => {
    const { transactionId } = await params;
    const parsed = parseCategoryPatch(await readJsonBody(req));
    if (!parsed.ok) {
      return badRequest(parsed.message);
    }

    try {
      const transaction = await setTransactionCategory(
        transactionId,
        parsed.kind,
        parsed.categoryId,
      );
      return NextResponse.json<TransactionPatchPayload>({ transaction });
    } catch (err) {
      // 23503 foreign_key_violation: the category was deleted between
      // validation and the update; everything else rethrows into the wrapper.
      if (pgErrorCode(err) === '23503') {
        return jsonError(
          'CATEGORY_REMOVED',
          'That category no longer exists — reload the page and pick again',
          409,
        );
      }
      throw err;
    }
  },
);
